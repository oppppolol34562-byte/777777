import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Message, Profile as ProfileType } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import TopBar from '@/components/layout/TopBar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Send, ImagePlus, Eye, EyeOff, Lock, Mic, Phone, Video, MoreVertical, Trash2, Volume2, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function Chat() {
  const { username } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [otherUser, setOtherUser] = useState<ProfileType | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [showViewOnce, setShowViewOnce] = useState<string | null>(null)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [viewOnceMode, setViewOnceMode] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const targetUsername = username || searchParams.get('to')

  const fetchOtherUser = useCallback(async () => {
    if (!targetUsername) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', targetUsername)
      .maybeSingle()
    setOtherUser(data)
  }, [targetUsername])

  const fetchMessages = useCallback(async () => {
    if (!user || !otherUser) return
    setLoading(true)

    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUser.id}),and(sender_id.eq.${otherUser.id},receiver_id.eq.${user.id})`)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(200)

    setMessages(data || [])
    setLoading(false)

    // Mark received messages as seen
    const unseen = data?.filter(m => m.receiver_id === user.id && !m.is_seen) || []
    if (unseen.length > 0) {
      await supabase
        .from('messages')
        .update({ is_seen: true })
        .in('id', unseen.map(m => m.id))
    }

    // Check mute status
    const { data: muted } = await supabase
      .from('muted_chats')
      .select('id')
      .eq('user_id', user.id)
      .eq('muted_user_id', otherUser.id)
      .maybeSingle()
    setIsMuted(!!muted)
  }, [user, otherUser])

  useEffect(() => {
    fetchOtherUser()
  }, [fetchOtherUser])

  useEffect(() => {
    if (otherUser) fetchMessages()
  }, [otherUser, fetchMessages])

  // Real-time subscription
  useEffect(() => {
    if (!user || !otherUser) return
    const channel = supabase
      .channel(`chat-${otherUser.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${otherUser.id}` },
        (payload) => {
          if (payload.new.receiver_id === user.id) {
            setMessages(prev => [...prev, payload.new as Message])
            // Mark as seen
            supabase.from('messages').update({ is_seen: true }).eq('id', payload.new.id)
          }
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${otherUser.id}` },
        () => fetchMessages()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, otherUser, fetchMessages])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const uploadMedia = async (file: File) => {
    if (!user) return
    setUploadingMedia(true)
    try {
      const isVideo = file.type.startsWith('video/')
      const isAudio = file.type.startsWith('audio/')
      const folder = isAudio ? 'audio' : isVideo ? 'videos' : 'images'
      const ext = file.name.split('.').pop()
      const path = `${folder}/${user.id}-${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('messages')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage
        .from('messages')
        .getPublicUrl(path)

      await sendMessage('', publicUrl, isAudio ? 'audio' : isVideo ? 'video' : 'image')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingMedia(false)
    }
  }

  const sendMessage = async (content?: string, mediaUrl?: string, mediaType?: '' | 'image' | 'video' | 'audio') => {
    if (!user || !otherUser) return
    const msgContent = content ?? newMessage
    if (!msgContent.trim() && !mediaUrl) return
    setSending(true)

    try {
      const { data, error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: otherUser.id,
        content: msgContent.trim(),
        media_url: mediaUrl || '',
        media_type: mediaType || '',
        is_encrypted: true,
        view_once: viewOnceMode && !!mediaUrl,
      }).select('*').single()

      if (error) throw error
      if (data) {
        setMessages(prev => [...prev, data])
        setNewMessage('')
        setViewOnceMode(false)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const toggleMute = async () => {
    if (!user || !otherUser) return
    if (isMuted) {
      await supabase.from('muted_chats').delete()
        .eq('user_id', user.id).eq('muted_user_id', otherUser.id)
      setIsMuted(false)
      toast.success('Unmuted')
    } else {
      await supabase.from('muted_chats').insert({
        user_id: user.id, muted_user_id: otherUser.id,
      })
      setIsMuted(true)
      toast.success('Muted')
    }
  }

  const blockUser = async () => {
    if (!user || !otherUser) return
    await supabase.from('blocks').insert({
      blocker_id: user.id, blocked_id: otherUser.id,
    })
    await supabase.from('follows').delete()
      .or(`and(follower_id.eq.${user.id},following_id.eq.${otherUser.id}),and(follower_id.eq.${otherUser.id},following_id.eq.${user.id})`)
    toast.success('User blocked')
    navigate('/messages')
  }

  const clearChat = async () => {
    if (!user || !otherUser) return
    await supabase.from('messages').update({ deleted_at: new Date().toISOString() })
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUser.id}),and(sender_id.eq.${otherUser.id},receiver_id.eq.${user.id})`)
    setMessages([])
    toast.success('Chat cleared')
  }

  const openViewOnce = (msg: Message) => {
    setShowViewOnce(msg.media_url)
    // Mark as opened
    supabase.from('messages').update({ view_once_opened: true }).eq('id', msg.id)
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, view_once_opened: true } : m))
  }

  if (!targetUsername) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Select a conversation</p>
      </div>
    )
  }

  if (loading || !otherUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        title=""
        showBack
        right={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-9">
              <Phone className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-9">
              <Video className="size-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9">
                  <MoreVertical className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={toggleMute}>
                  <Volume2 className="size-4 mr-2" />
                  {isMuted ? 'Unmute' : 'Mute'} notifications
                </DropdownMenuItem>
                <DropdownMenuItem onClick={clearChat}>
                  <Trash2 className="size-4 mr-2" /> Clear chat
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={blockUser} className="text-destructive focus:text-destructive">
                  <Ban className="size-4 mr-2" /> Block user
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Chat header info */}
      <Link to={`/profile/${otherUser.username}`} className="flex items-center gap-3 px-4 py-2 border-b hover:bg-accent/30">
        <Avatar className="size-10">
          <AvatarImage src={otherUser.avatar_url} />
          <AvatarFallback>{otherUser.username[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold">{otherUser.username}</p>
            {otherUser.is_verified && (
              <svg className="size-3 text-blue-500 fill-current" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
              </svg>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{otherUser.full_name || 'Active now'}</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3" />
          <span>Encrypted</span>
        </div>
      </Link>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Avatar className="size-20">
              <AvatarImage src={otherUser.avatar_url} />
              <AvatarFallback className="text-2xl">{otherUser.username[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{otherUser.username}</p>
              <p className="text-sm text-muted-foreground">{otherUser.full_name || ''}</p>
            </div>
            <Button size="sm" onClick={() => sendMessage('Hi! 👋')}>
              Say hello
            </Button>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_id === user?.id
            const prevMsg = messages[idx - 1]
            const showDate = !prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(msg.created_at).toDateString()

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-3">
                    <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      {format(new Date(msg.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
                <div className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[75%] rounded-2xl px-3 py-2",
                    isMe ? "bg-primary text-primary-foreground" : "bg-muted",
                    msg.view_once && "border-2 border-dashed"
                  )}>
                    {/* View-once media */}
                    {msg.view_once && msg.media_url && !msg.view_once_opened ? (
                      <button
                        onClick={() => openViewOnce(msg)}
                        className="flex items-center gap-2"
                      >
                        <Eye className="size-4" />
                        <span className="text-sm">View-once photo</span>
                      </button>
                    ) : msg.view_once && msg.view_once_opened ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <EyeOff className="size-4" />
                        <span className="text-sm italic">Media expired</span>
                      </div>
                    ) : (
                      <>
                        {msg.media_url && msg.media_type === 'image' && (
                          <img src={msg.media_url} alt="" className="rounded-lg max-w-48 max-h-48 object-cover mb-1" />
                        )}
                        {msg.media_url && msg.media_type === 'video' && (
                          <video src={msg.media_url} controls playsInline className="rounded-lg max-w-48 max-h-48 mb-1" />
                        )}
                        {msg.media_url && msg.media_type === 'audio' && (
                          <div className="flex items-center gap-2 py-1">
                            <Button variant="ghost" size="icon" className="size-8">
                              <Mic className="size-4" />
                            </Button>
                            <audio src={msg.media_url} controls className="h-8 max-w-40" />
                          </div>
                        )}
                        {msg.content && (
                          <p className="text-sm break-words whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </>
                    )}
                    {/* Timestamp + status */}
                    <div className={cn("flex items-center gap-1 mt-0.5", isMe ? "justify-end" : "justify-start")}>
                      <span className="text-[10px] opacity-60">
                        {format(new Date(msg.created_at), 'h:mm a')}
                      </span>
                      {isMe && !msg.view_once && (
                        <span className="text-[10px] opacity-60">
                          {msg.is_seen ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3 pb-safe flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) uploadMedia(f)
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={() => fileRef.current?.click()}
          disabled={uploadingMedia}
        >
          {uploadingMedia ? <Spinner className="size-5" /> : <ImagePlus className="size-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-9 shrink-0", viewOnceMode && "text-primary")}
          onClick={() => { setViewOnceMode(!viewOnceMode); toast.info(viewOnceMode ? 'View-once off' : 'View-once on - media disappears after viewing') }}
        >
          {viewOnceMode ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
        </Button>
        <Input
          placeholder="Message..."
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !sending && sendMessage()}
          className="flex-1"
        />
        <Button
          size="icon"
          className="size-9 shrink-0"
          disabled={(!newMessage.trim() && !uploadingMedia) || sending}
          onClick={() => sendMessage()}
        >
          {sending ? <Spinner className="size-4" /> : <Send className="size-4" />}
        </Button>
      </div>

      {/* View-once overlay */}
      {showViewOnce && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setShowViewOnce(null)}
        >
          <img src={showViewOnce} alt="" className="max-w-full max-h-full object-contain" />
          <Button
            variant="ghost"
            className="absolute top-4 right-4 text-white"
            size="icon"
            onClick={() => setShowViewOnce(null)}
          >
            <span className="text-2xl">✕</span>
          </Button>
        </div>
      )}
    </div>
  )
}
