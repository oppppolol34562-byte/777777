import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import TopBar from '@/components/layout/TopBar'
import StoryBar from '@/components/stories/StoryBar'
import PostCard from '@/components/posts/PostCard'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Camera } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Feed() {
  const { user } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 10

  const fetchPosts = useCallback(async (pageNum: number) => {
    if (!user) return
    setLoading(true)

    // Get following IDs
    const { data: followData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .eq('status', 'accepted')

    const followingIds = followData?.map(f => f.following_id) || []
    const feedIds = [user.id, ...followingIds]

    const { data } = await supabase
      .from('posts')
      .select(`
        *,
        profiles!user_id(id, username, full_name, avatar_url, is_verified),
        likes(user_id),
        comments(id),
        post_tags(tag)
      `)
      .in('user_id', feedIds)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    const enriched = (data || []).map(p => ({
      ...p,
      _likes_count: p.likes?.length || 0,
      _comments_count: p.comments?.length || 0,
      _liked_by_me: p.likes?.some((l: { user_id: string }) => l.user_id === user.id) || false,
      _tags: p.post_tags?.map((t: { tag: string }) => t.tag) || [],
    }))

    if (pageNum === 0) {
      setPosts(enriched)
    } else {
      setPosts(prev => [...prev, ...enriched])
    }
    setHasMore(enriched.length === PAGE_SIZE)
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchPosts(0)
  }, [fetchPosts])

  // Infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.offsetHeight - 300 &&
        hasMore && !loading
      ) {
        const nextPage = page + 1
        setPage(nextPage)
        fetchPosts(nextPage)
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasMore, loading, page, fetchPosts])

  return (
    <div className="pb-20">
      <TopBar showLogo />
      <div className="max-w-lg mx-auto">
        <StoryBar />
        <Separator />

        {loading && posts.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <Spinner className="size-6" />
          </div>
        ) : posts.length === 0 ? (
          <Empty className="mt-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Camera className="size-6" />
              </EmptyMedia>
              <EmptyTitle>Your feed is empty</EmptyTitle>
              <EmptyDescription>
                Follow people to see their posts here.{' '}
                <Link to="/explore" className="text-primary">Explore</Link> to find accounts.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onDeleted={id => setPosts(ps => ps.filter(p => p.id !== id))}
              />
            ))}
            {loading && (
              <div className="flex items-center justify-center h-16">
                <Spinner className="size-5" />
              </div>
            )}
            {!hasMore && posts.length > 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">You're all caught up!</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
