import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Post, Comment } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Heart, MessageCircle, Send, Bookmark, MoveHorizontal as MoreHorizontal, Pin, Trash2, Flag, Volume2, Link2, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatDistanceToNow } from 'date-fns'

type PostCardProps = {
  post: Post
  onDeleted?: (id: string) => void
  onUpdated?: (post: Post) => void
}

export default function PostCard({ post, onDeleted }: PostCardProps) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [liked, setLiked] = useState(post._liked_by_me || false)
  const [likesCount, setLikesCount] = useState(post._likes_count || 0)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(post._saved_by_me || false)

  const isOwner = user?.id === post.user_id

  const toggleLike = async () => {
    if (!user) return
    const newLiked = !liked
    setLiked(newLiked)
    setLikesCount(c => newLiked ? c + 1 : c - 1)

    if (newLiked) {
      await supabase.from('likes').upsert({ post_id: post.id, user_id: user.id }, { onConflict: 'post_id,user_id' })
      if (post.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id, actor_id: user.id, type: 'like', post_id: post.id
        })
      }
    } else {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
    }
  }

  const loadComments = async () => {
    if (commentsLoaded) return
    const { data } = await supabase
      .from('comments')
      .select('*, profiles!user_id(id, username, full_name, avatar_url, is_verified), comment_likes(user_id)')
      .eq('post_id', post.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: true })

    setComments((data || []).map(c => ({
      ...c,
      _likes_count: c.comment_likes?.length || 0,
      _liked_by_me: c.comment_likes?.some((l: { user_id: string }) => l.user_id === user?.id) || false,
    })))
    setCommentsLoaded(true)
  }

  const openComments = async () => {
    setCommentsOpen(true)
    await loadComments()
  }

  const submitComment = async () => {
    if (!newComment.trim() || !user || submitting) return
    setSubmitting(true)
    const { data } = await supabase
      .from('comments')
      .insert({ post_id: post.id, user_id: user.id, content: newComment.trim() })
      .select('*, profiles!user_id(id, username, full_name, avatar_url, is_verified)')
      .single()

    if (data) {
      setComments(c => [...c, { ...data, _likes_count: 0, _liked_by_me: false }])
      if (post.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id, actor_id: user.id, type: 'comment', post_id: post.id
        })
      }
    }
    setNewComment('')
    setSubmitting(false)
  }

  const toggleCommentLike = async (comment: Comment) => {
    if (!user) return
    const newLiked = !comment._liked_by_me
    setComments(cs => cs.map(c => c.id === comment.id
      ? { ...c, _liked_by_me: newLiked, _likes_count: newLiked ? (c._likes_count || 0) + 1 : (c._likes_count || 0) - 1 }
      : c
    ))
    if (newLiked) {
      await supabase.from('comment_likes').upsert({ comment_id: comment.id, user_id: user.id }, { onConflict: 'comment_id,user_id' })
    } else {
      await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', user.id)
    }
  }

  const pinComment = async (comment: Comment) => {
    const newPinned = !comment.is_pinned
    await supabase.from('comments').update({ is_pinned: newPinned }).eq('id', comment.id)
    setComments(cs => {
      const updated = cs.map(c => c.id === comment.id ? { ...c, is_pinned: newPinned } : { ...c, is_pinned: false })
      return updated.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
    })
  }

  const deleteComment = async (commentId: string) => {
    await supabase.from('comments').delete().eq('id', commentId)
    setComments(cs => cs.filter(c => c.id !== commentId))
  }

  const deletePost = async () => {
    await supabase.from('posts').delete().eq('id', post.id)
    toast.success('Post deleted')
    onDeleted?.(post.id)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`)
    toast.success('Link copied!')
  }

  const toggleSave = async () => {
    if (!user) return
    const newSaved = !saved
    setSaved(newSaved)
    if (newSaved) {
      await supabase.from('saved_posts').upsert(
        { post_id: post.id, user_id: user.id },
        { onConflict: 'user_id,post_id' }
      )
      toast.success('Post saved')
    } else {
      await supabase.from('saved_posts').delete()
        .eq('post_id', post.id).eq('user_id', user.id)
      toast.success('Post removed')
    }
  }

  return (
    <>
      <article className="border-b border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <Link to={`/profile/${post.profiles?.username}`} className="flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarImage src={post.profiles?.avatar_url} />
              <AvatarFallback>{post.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold leading-none">{post.profiles?.username}</span>
                {post.profiles?.is_verified && (
                  <svg className="size-3.5 text-blue-500 fill-current" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                  </svg>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </span>
            </div>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={copyLink}>
                <Link2 className="size-4 mr-2" /> Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/messages/new?to=${post.profiles?.username}`)}>
                <Share2 className="size-4 mr-2" /> Share via message
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isOwner ? (
                <DropdownMenuItem onClick={deletePost} className="text-destructive focus:text-destructive">
                  <Trash2 className="size-4 mr-2" /> Delete post
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem>
                    <Volume2 className="size-4 mr-2" /> Mute
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive">
                    <Flag className="size-4 mr-2" /> Report
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Media */}
        <div className="relative bg-muted aspect-square">
          {post.media_type === 'video' ? (
            <video
              src={post.media_url}
              className="w-full h-full object-cover"
              controls
              playsInline
            />
          ) : (
            <img
              src={post.media_url}
              alt={post.caption}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
        </div>

        {/* Actions */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleLike}
                className={cn(
                  "transition-transform active:scale-90",
                  liked ? "text-red-500" : "text-foreground"
                )}
              >
                <Heart className={cn("size-6 stroke-[1.5]", liked && "fill-current")} />
              </button>
              <button onClick={openComments} className="text-foreground">
                <MessageCircle className="size-6 stroke-[1.5]" />
              </button>
              <button onClick={() => navigate(`/messages/new?to=${post.profiles?.username}`)}>
                <Send className="size-6 stroke-[1.5]" />
              </button>
            </div>
            <Button variant="ghost" size="icon" className="size-8 -mr-2" onClick={toggleSave}>
              <Bookmark className={cn("size-6 stroke-[1.5]", saved && "fill-current text-primary")} />
            </Button>
          </div>

          {likesCount > 0 && (
            <p className="text-sm font-semibold">{likesCount.toLocaleString()} {likesCount === 1 ? 'like' : 'likes'}</p>
          )}

          {(post.title || post.caption) && (
            <div className="mt-1">
              {post.title && (
                <p className="text-sm font-semibold">{post.title}</p>
              )}
              {post.caption && (
                <p className="text-sm">
                  <Link to={`/profile/${post.profiles?.username}`} className="font-semibold mr-1">
                    {post.profiles?.username}
                  </Link>
                  {post.caption}
                </p>
              )}
              {post.description && (
                <p className="text-sm text-muted-foreground mt-1">{post.description}</p>
              )}
              {post._tags && post._tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {post._tags.map(tag => (
                    <span key={tag} className="text-xs text-primary">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {post._comments_count ? (
            <button
              className="text-sm text-muted-foreground mt-1"
              onClick={openComments}
            >
              View all {post._comments_count} comments
            </button>
          ) : null}
        </div>
      </article>

      {/* Comments Sheet */}
      <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
        <SheetContent side="bottom" className="h-[80vh] flex flex-col p-0">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>Comments</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-2">
            {comments.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                No comments yet. Be the first!
              </div>
            ) : (
              comments.map(comment => (
                <div key={comment.id} className={cn("flex gap-3 px-4 py-2", comment.is_pinned && "bg-muted/40")}>
                  <Link to={`/profile/${comment.profiles?.username}`}>
                    <Avatar className="size-8 shrink-0">
                      <AvatarImage src={comment.profiles?.avatar_url} />
                      <AvatarFallback>{comment.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        {comment.is_pinned && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                            <Pin className="size-3" /> Pinned
                          </div>
                        )}
                        <p className="text-sm">
                          <Link to={`/profile/${comment.profiles?.username}`} className="font-semibold mr-1">
                            {comment.profiles?.username}
                          </Link>
                          {comment.content}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => toggleCommentLike(comment)}
                          className={cn("text-sm", comment._liked_by_me ? "text-red-500" : "text-muted-foreground")}
                        >
                          <Heart className={cn("size-4", comment._liked_by_me && "fill-current")} />
                        </button>
                        {(isOwner || user?.id === comment.user_id) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-6 h-6 w-6">
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isOwner && (
                                <DropdownMenuItem onClick={() => pinComment(comment)}>
                                  <Pin className="size-4 mr-2" />
                                  {comment.is_pinned ? 'Unpin' : 'Pin'}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => deleteComment(comment.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="size-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Comment input */}
          <div className="border-t p-4 pb-safe flex gap-3 items-center">
            <Avatar className="size-8 shrink-0">
              <AvatarImage src={profile?.avatar_url} />
              <AvatarFallback>{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <Input
              placeholder="Add a comment..."
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitComment()}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-primary font-semibold"
              disabled={!newComment.trim() || submitting}
              onClick={submitComment}
            >
              Post
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
