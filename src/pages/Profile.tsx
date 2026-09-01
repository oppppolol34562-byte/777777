import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Profile as ProfileType, Post } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Settings, Grid3x3, Film, Bookmark, Plus, UserPlus, UserCheck, Lock, QrCode as QrIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function Profile() {
  const { username } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<ProfileType | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followStatus, setFollowStatus] = useState<'none' | 'accepted' | 'pending'>('none')
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [showQR, setShowQR] = useState(false)
  const [showFollowers, setShowFollowers] = useState(false)
  const [showFollowing, setShowFollowing] = useState(false)
  const [followerList, setFollowerList] = useState<ProfileType[]>([])
  const [followingList, setFollowingList] = useState<ProfileType[]>([])

  const isOwner = user?.id === profile?.id

  const fetchProfile = useCallback(async () => {
    if (!username) return
    setLoading(true)
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .maybeSingle()

    if (!prof) {
      setLoading(false)
      return
    }
    setProfile(prof)

    // Fetch posts — RLS automatically filters to only posts the viewer can see
    const { data: postData } = await supabase
      .from('posts')
      .select('*, profiles!user_id(id, username, full_name, avatar_url, is_verified, is_private), likes(user_id), comments(id), post_tags(tag)')
      .eq('user_id', prof.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })

    setPosts((postData || []).map(p => ({
      ...p,
      _likes_count: p.likes?.length || 0,
      _comments_count: p.comments?.length || 0,
      _liked_by_me: p.likes?.some((l: { user_id: string }) => l.user_id === user?.id) || false,
      _tags: p.post_tags?.map((t: { tag: string }) => t.tag) || [],
    })))

    // Check follow status
    if (user && !isOwner) {
      const { data: follow } = await supabase
        .from('follows')
        .select('status')
        .eq('follower_id', user.id)
        .eq('following_id', prof.id)
        .maybeSingle()
      if (follow) {
        setFollowStatus(follow.status as 'accepted' | 'pending')
        setIsFollowing(follow.status === 'accepted')
      } else {
        setFollowStatus('none')
        setIsFollowing(false)
      }
    }

    // Counts
    const { count: fc } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', prof.id)
      .eq('status', 'accepted')
    setFollowersCount(fc || 0)

    const { count: fgc } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', prof.id)
      .eq('status', 'accepted')
    setFollowingCount(fgc || 0)

    setLoading(false)
  }, [username, user, isOwner])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleFollow = async () => {
    if (!user || !profile) return
    const targetPrivate = profile.is_private
    const newStatus = targetPrivate ? 'pending' : 'accepted'

    // Optimistic
    setFollowStatus(targetPrivate ? 'pending' : 'accepted')
    if (!targetPrivate) setIsFollowing(true)

    await supabase.from('follows').upsert({
      follower_id: user.id,
      following_id: profile.id,
      status: newStatus,
    }, { onConflict: 'follower_id,following_id' })

    if (!targetPrivate) {
      setFollowersCount(c => c + 1)
      await supabase.from('notifications').insert({
        user_id: profile.id, actor_id: user.id, type: 'follow'
      })
    } else {
      await supabase.from('notifications').insert({
        user_id: profile.id, actor_id: user.id, type: 'follow_request'
      })
    }
  }

  const handleUnfollow = async () => {
    if (!user || !profile) return
    setFollowStatus('none')
    setIsFollowing(false)
    setFollowersCount(c => Math.max(0, c - 1))
    await supabase.from('follows').delete()
      .eq('follower_id', user.id)
      .eq('following_id', profile.id)
  }

  const loadFollowers = async () => {
    if (!profile) return
    const { data } = await supabase
      .from('follows')
      .select('follower_id, profiles!follower_id(id, username, full_name, avatar_url, is_verified)')
      .eq('following_id', profile.id)
      .eq('status', 'accepted')
    setFollowerList(data?.map(f => f.profiles as unknown as ProfileType) || [])
    setShowFollowers(true)
  }

  const loadFollowing = async () => {
    if (!profile) return
    const canView = profile.show_followers_to === 'everyone' ||
      (profile.show_followers_to === 'followers' && isFollowing) ||
      isOwner
    if (!canView) {
      toast.error('This following list is private')
      return
    }
    const { data } = await supabase
      .from('follows')
      .select('following_id, profiles!following_id(id, username, full_name, avatar_url, is_verified)')
      .eq('follower_id', profile.id)
      .eq('status', 'accepted')
    setFollowingList(data?.map(f => f.profiles as unknown as ProfileType) || [])
    setShowFollowing(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">User not found</p>
      </div>
    )
  }

  const profileUrl = `${window.location.origin}/profile/${profile.username}`

  return (
    <div className="pb-20">
      <TopBar
        title={profile.username}
        showBack
        right={
          isOwner ? (
            <Button variant="ghost" size="icon" className="size-9" asChild>
              <Link to="/settings"><Settings className="size-5" /></Link>
            </Button>
          ) : undefined
        }
      />
      <div className="max-w-lg mx-auto">
        {/* Profile Header */}
        <div className="px-4 pt-4">
          <div className="flex items-start gap-6">
            <div className="relative">
              <Avatar className="size-20 ring-2 ring-border">
                <AvatarImage src={profile.avatar_url} />
                <AvatarFallback className="text-2xl">{profile.username[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              {isOwner && (
                <button
                  onClick={() => navigate('/create-story')}
                  className="absolute -bottom-1 -right-1 bg-primary rounded-full size-7 flex items-center justify-center ring-2 ring-background"
                >
                  <Plus className="size-4 text-primary-foreground" />
                </button>
              )}
            </div>

            <div className="flex-1 flex items-center justify-around pt-2">
              <div className="text-center">
                <p className="text-lg font-semibold">{posts.length}</p>
                <p className="text-sm text-muted-foreground">posts</p>
              </div>
              <button className="text-center" onClick={loadFollowers}>
                <p className="text-lg font-semibold">{followersCount}</p>
                <p className="text-sm text-muted-foreground">followers</p>
              </button>
              <button className="text-center" onClick={loadFollowing}>
                <p className="text-lg font-semibold">{followingCount}</p>
                <p className="text-sm text-muted-foreground">following</p>
              </button>
            </div>
          </div>

          {/* Name + Bio */}
          <div className="mt-3">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold">{profile.full_name || profile.username}</p>
              {profile.is_verified && (
                <svg className="size-4 text-blue-500 fill-current" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                </svg>
              )}
              {profile.is_private && (
                <Lock className="size-3.5 text-muted-foreground" />
              )}
            </div>
            {profile.bio && <p className="text-sm mt-1 whitespace-pre-wrap">{profile.bio}</p>}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            {isOwner ? (
              <>
                <Button variant="secondary" className="flex-1" asChild>
                  <Link to="/edit-profile">Edit profile</Link>
                </Button>
                <Button variant="secondary" size="icon" onClick={() => setShowQR(true)}>
                  <QrIcon className="size-4" />
                </Button>
              </>
            ) : (
              <>
                {followStatus === 'accepted' ? (
                  <>
                    <Button variant="secondary" className="flex-1" onClick={handleUnfollow}>
                      <UserCheck className="size-4 mr-1" /> Following
                    </Button>
                    <Button variant="secondary" className="flex-1" asChild>
                      <Link to={`/messages/${profile.username}`}>Message</Link>
                    </Button>
                  </>
                ) : followStatus === 'pending' ? (
                  <Button variant="secondary" className="flex-1" disabled>
                    Requested
                  </Button>
                ) : (
                  <>
                    <Button className="flex-1" onClick={handleFollow}>
                      <UserPlus className="size-4 mr-1" />
                      {profile.is_private ? 'Follow' : 'Follow'}
                    </Button>
                    <Button variant="secondary" className="flex-1" asChild>
                      <Link to={`/messages/${profile.username}`}>Message</Link>
                    </Button>
                  </>
                )}
                <Button variant="secondary" size="icon" onClick={() => setShowQR(true)}>
                  <QrIcon className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="posts" className="mt-6">
          <TabsList className="w-full justify-around rounded-none border-b bg-transparent h-12 p-0">
            <TabsTrigger value="posts" className="flex-1">
              <Grid3x3 className="size-5" />
            </TabsTrigger>
            <TabsTrigger value="reels" className="flex-1">
              <Film className="size-5" />
            </TabsTrigger>
            <TabsTrigger value="saved" className="flex-1">
              <Bookmark className="size-5" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts">
            {posts.length === 0 ? (
              <Empty className="mt-12">
                <EmptyHeader>
                  <EmptyTitle>No posts yet</EmptyTitle>
                  <EmptyDescription>
                    {isOwner ? "Share your first post!" : `${profile.username} hasn't posted yet.`}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                {posts.map(post => (
                  <Link key={post.id} to={`/?post=${post.id}`} className="aspect-square relative group">
                    <img
                      src={post.media_url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {post.media_type === 'video' && (
                      <Film className="absolute top-1 right-1 size-4 text-white fill-current" />
                    )}
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reels">
            <Empty className="mt-12">
              <EmptyHeader>
                <EmptyTitle>No reels yet</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </TabsContent>

          <TabsContent value="saved">
            {isOwner ? (
              <Empty className="mt-12">
                <EmptyHeader>
                  <EmptyTitle>No saved posts</EmptyTitle>
                  <EmptyDescription>Posts you save will appear here.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Empty className="mt-12">
                <EmptyHeader>
                  <EmptyTitle>This section is private</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />

      {/* QR Dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center">{profile.username}'s QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="p-4 bg-white rounded-xl">
              <QRCodeSVG value={profileUrl} size={200} />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(profileUrl)
                toast.success('Profile link copied!')
              }}
            >
              Copy profile link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Followers Dialog */}
      <Dialog open={showFollowers} onOpenChange={setShowFollowers}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Followers</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {followerList.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No followers yet</p>
            ) : (
              followerList.map(p => (
                <Link
                  key={p.id}
                  to={`/profile/${p.username}`}
                  onClick={() => setShowFollowers(false)}
                  className="flex items-center gap-3 py-2 hover:bg-accent/50 rounded-lg px-2"
                >
                  <Avatar className="size-10">
                    <AvatarImage src={p.avatar_url} />
                    <AvatarFallback>{p.username[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium truncate">{p.username}</p>
                      {p.is_verified && (
                        <svg className="size-3 text-blue-500 fill-current" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{p.full_name}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Following Dialog */}
      <Dialog open={showFollowing} onOpenChange={setShowFollowing}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Following</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {followingList.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Not following anyone yet</p>
            ) : (
              followingList.map(p => (
                <Link
                  key={p.id}
                  to={`/profile/${p.username}`}
                  onClick={() => setShowFollowing(false)}
                  className="flex items-center gap-3 py-2 hover:bg-accent/50 rounded-lg px-2"
                >
                  <Avatar className="size-10">
                    <AvatarImage src={p.avatar_url} />
                    <AvatarFallback>{p.username[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium truncate">{p.username}</p>
                      {p.is_verified && (
                        <svg className="size-3 text-blue-500 fill-current" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{p.full_name}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
