import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Notification } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty'
import { Heart, UserPlus, MessageCircle, Bell } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function Notifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select(`
        *,
        actor:profiles!actor_id(id, username, full_name, avatar_url, is_verified),
        post:posts(id, media_url, media_type)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    setNotifications(data || [])

    // Mark as read
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart className="size-3 text-red-500 fill-current" />
      case 'comment': return <MessageCircle className="size-3 text-blue-500 fill-current" />
      case 'follow':
      case 'follow_request': return <UserPlus className="size-3 text-green-500 fill-current" />
      default: return <Bell className="size-3" />
    }
  }

  const getMessage = (n: Notification) => {
    switch (n.type) {
      case 'like': return 'liked your post'
      case 'comment': return 'commented on your post'
      case 'follow': return 'started following you'
      case 'follow_request': return 'requested to follow you'
      case 'mention': return 'mentioned you'
      case 'story_reply': return 'replied to your story'
      default: return 'interacted with you'
    }
  }

  return (
    <div className="pb-20">
      <TopBar title="Notifications" />
      <div className="max-w-lg mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Spinner className="size-6" />
          </div>
        ) : notifications.length === 0 ? (
          <Empty className="mt-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell className="size-6" />
              </EmptyMedia>
              <EmptyTitle>No notifications yet</EmptyTitle>
              <EmptyDescription>Activity from people you follow will show up here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map(n => (
              <Link
                key={n.id}
                to={n.post ? `/profile/${n.actor?.username}` : `/profile/${n.actor?.username}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50"
              >
                <div className="relative">
                  <Avatar className="size-12">
                    <AvatarImage src={n.actor?.avatar_url} />
                    <AvatarFallback>{n.actor?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 bg-card rounded-full size-5 flex items-center justify-center ring-2 ring-card">
                    {getIcon(n.type)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{n.actor?.username}</span>{' '}
                    <span className="text-muted-foreground">{getMessage(n)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                {n.post?.media_url && (
                  <img
                    src={n.post.media_url}
                    alt=""
                    className="size-10 object-cover rounded"
                    loading="lazy"
                  />
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
