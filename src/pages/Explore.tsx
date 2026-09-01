import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Post, Profile as ProfileType } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Search, Film, UserPlus, UserCheck } from 'lucide-react'

export default function Explore() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [users, setUsers] = useState<ProfileType[]>([])
  const [loading, setLoading] = useState(true)
  const [searchPosts, setSearchPosts] = useState<Post[]>([])
  const [, setSearching] = useState(false)
  const [followStates, setFollowStates] = useState<Record<string, 'accepted' | 'pending' | 'none'>>({})
  const [suggested, setSuggested] = useState<ProfileType[]>([])

  const fetchExplore = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('posts')
      .select('*, profiles!user_id(id, username, full_name, avatar_url, is_verified, is_private), likes(user_id), post_tags(tag)')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(60)

    setPosts((data || []).map(p => ({
      ...p,
      _likes_count: p.likes?.length || 0,
      _liked_by_me: p.likes?.some((l: { user_id: string }) => l.user_id === user?.id) || false,
      _tags: p.post_tags?.map((t: { tag: string }) => t.tag) || [],
    })))
    setLoading(false)
  }, [user])

  const fetchSuggested = useCallback(async () => {
    if (!user) return
    // Get users I follow
    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const followingIds = following?.map(f => f.following_id) || []
    followingIds.push(user.id)

    // Get users I don't follow (suggestions)
    const { data: suggestions } = await supabase
      .from('profiles')
      .select('*')
      .not('id', 'in', `(${followingIds.join(',')})`)
      .limit(10)

    setSuggested(suggestions || [])

    // Check follow states for suggestions
    const states: Record<string, 'accepted' | 'pending' | 'none'> = {}
    suggestions?.forEach(s => { states[s.id] = 'none' })
    setFollowStates(states)
  }, [user])

  useEffect(() => {
    fetchExplore()
    fetchSuggested()
  }, [fetchExplore, fetchSuggested])

  const handleSearch = async () => {
    if (!query.trim()) {
      setUsers([])
      return
    }
    setSearching(true)
    // Search users
    const { data: userData } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
      .limit(20)
    setUsers(userData || [])

    // Search posts by tag
    const { data: tagPosts } = await supabase
      .from('post_tags')
      .select('post_id, posts!inner(id, media_url, media_type, status, visibility, user_id, profiles!user_id(username, avatar_url))')
      .ilike('tag', `%${query}%`)
      .limit(20)

    // Also search posts by title/description
    const { data: textPosts } = await supabase
      .from('posts')
      .select('id, media_url, media_type, status, user_id, profiles!user_id(username, avatar_url)')
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,caption.ilike.%${query}%`)
      .eq('status', 'published')
      .limit(20)

    // Merge results (RLS filters inaccessible posts)
    const seenIds = new Set<string>()
    const searchPosts: Post[] = []
    for (const tp of (tagPosts || [])) {
      const p = tp.posts as unknown as Post
      if (p && p.status === 'published' && !seenIds.has(p.id)) {
        seenIds.add(p.id)
        searchPosts.push(p)
      }
    }
    for (const p of (textPosts || [])) {
      if (p && !seenIds.has(p.id)) {
        seenIds.add(p.id)
        searchPosts.push(p as unknown as Post)
      }
    }
    setSearchPosts(searchPosts)
    setSearching(false)
  }

  const handleFollow = async (targetId: string) => {
    if (!user) return
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_private')
      .eq('id', targetId)
      .maybeSingle()

    const status = prof?.is_private ? 'pending' : 'accepted'
    setFollowStates(s => ({ ...s, [targetId]: status }))

    await supabase.from('follows').upsert({
      follower_id: user.id,
      following_id: targetId,
      status,
    }, { onConflict: 'follower_id,following_id' })

    if (status === 'accepted') {
      await supabase.from('notifications').insert({
        user_id: targetId, actor_id: user.id, type: 'follow'
      })
    }
  }

  return (
    <div className="pb-20">
      <TopBar title="Explore" />
      <div className="max-w-lg mx-auto">
        {/* Search */}
        <div className="px-4 py-3 sticky top-14 bg-background z-10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="pl-9"
            />
          </div>
        </div>

        {query.trim() ? (
          /* Search results */
          <div className="px-4">
            {users.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">Users</h2>
                {users.map(u => (
                  <Link
                    key={u.id}
                    to={`/profile/${u.username}`}
                    className="flex items-center gap-3 py-2 hover:bg-accent/50 rounded-lg px-2"
                  >
                    <Avatar className="size-12">
                      <AvatarImage src={u.avatar_url} />
                      <AvatarFallback>{u.username[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium truncate">{u.username}</p>
                        {u.is_verified && (
                          <svg className="size-3 text-blue-500 fill-current" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                          </svg>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{u.full_name || u.bio}</p>
                    </div>
                  </Link>
                ))}
              </>
            )}
            {searchPosts.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2 mt-4">Posts</h2>
                <div className="grid grid-cols-3 gap-0.5">
                  {searchPosts.map(post => (
                    <Link
                      key={post.id}
                      to={`/profile/${post.profiles?.username}`}
                      className="aspect-square relative group"
                    >
                      <img src={post.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      {post.media_type === 'video' && (
                        <Film className="absolute top-1 right-1 size-4 text-white fill-current" />
                      )}
                    </Link>
                  ))}
                </div>
              </>
            )}
            {users.length === 0 && searchPosts.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">No results found</p>
            )}
          </div>
        ) : (
          <Tabs defaultValue="discover">
            <TabsList className="w-full justify-around rounded-none border-b bg-transparent h-12 p-0">
              <TabsTrigger value="discover" className="flex-1">Discover</TabsTrigger>
              <TabsTrigger value="suggested" className="flex-1">Suggested</TabsTrigger>
            </TabsList>

            <TabsContent value="discover">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Spinner className="size-6" />
                </div>
              ) : posts.length === 0 ? (
                <Empty className="mt-12">
                  <EmptyHeader>
                    <EmptyTitle>No posts to explore</EmptyTitle>
                    <EmptyDescription>Check back later for more content.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid grid-cols-3 gap-0.5">
                  {posts.map(post => (
                    <Link
                      key={post.id}
                      to={`/profile/${post.profiles?.username}`}
                      className="aspect-square relative group"
                    >
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

            <TabsContent value="suggested">
              {suggested.length === 0 ? (
                <Empty className="mt-12">
                  <EmptyHeader>
                    <EmptyTitle>No suggestions yet</EmptyTitle>
                    <EmptyDescription>Follow more people to get better suggestions.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="px-4 py-2">
                  <h2 className="text-sm font-semibold text-muted-foreground mb-2">Suggested for you</h2>
                  {suggested.map(u => (
                    <div key={u.id} className="flex items-center gap-3 py-3">
                      <Link to={`/profile/${u.username}`}>
                        <Avatar className="size-12">
                          <AvatarImage src={u.avatar_url} />
                          <AvatarFallback>{u.username[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link to={`/profile/${u.username}`}>
                          <div className="flex items-center gap-1">
                            <p className="text-sm font-medium truncate">{u.username}</p>
                            {u.is_verified && (
                              <svg className="size-3 text-blue-500 fill-current" viewBox="0 0 24 24">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                              </svg>
                            )}
                          </div>
                        </Link>
                        <p className="text-xs text-muted-foreground truncate">{u.full_name || 'Suggested for you'}</p>
                      </div>
                      {followStates[u.id] === 'accepted' ? (
                        <Button variant="secondary" size="sm">
                          <UserCheck className="size-4 mr-1" /> Following
                        </Button>
                      ) : followStates[u.id] === 'pending' ? (
                        <Button variant="secondary" size="sm" disabled>Requested</Button>
                      ) : (
                        <Button size="sm" onClick={() => handleFollow(u.id)}>
                          <UserPlus className="size-4 mr-1" /> Follow
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
