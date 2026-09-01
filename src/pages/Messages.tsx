import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Message, Note, Profile as ProfileType } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty'
import { MessageCircle, Plus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Conversation = {
  user: ProfileType
  lastMessage: Message | null
  unreadCount: number
}

export default function Messages() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [postingNote, setPostingNote] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileType[]>([])

  const fetchConversations = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Get all messages involving the user
    const { data: messages } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!sender_id(id, username, full_name, avatar_url, is_verified),
        receiver:profiles!receiver_id(id, username, full_name, avatar_url, is_verified)
      `)
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)

    // Group by conversation partner
    const convMap = new Map<string, Conversation>()
    const unreadMap = new Map<string, number>()

    messages?.forEach(msg => {
      const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id
      const partner = msg.sender_id === user.id ? msg.receiver : msg.sender

      if (!convMap.has(partnerId)) {
        convMap.set(partnerId, {
          user: partner as unknown as ProfileType,
          lastMessage: msg,
          unreadCount: 0,
        })
      }

      // Count unread (messages sent TO me that are unseen)
      if (msg.receiver_id === user.id && !msg.is_seen && !msg.deleted_at) {
        unreadMap.set(partnerId, (unreadMap.get(partnerId) || 0) + 1)
      }
    })

    const convArray = Array.from(convMap.values())
    convArray.forEach(c => {
      c.unreadCount = unreadMap.get(c.user.id) || 0
    })
    convArray.sort((a, b) =>
      new Date(b.lastMessage?.created_at || 0).getTime() -
      new Date(a.lastMessage?.created_at || 0).getTime()
    )

    setConversations(convArray)
    setLoading(false)
  }, [user])

  const fetchNotes = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('notes')
      .select(`
        *,
        profiles!user_id(id, username, full_name, avatar_url, is_verified)
      `)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20)

    setNotes(data || [])
  }, [user])

  useEffect(() => {
    fetchConversations()
    fetchNotes()
  }, [fetchConversations, fetchNotes])

  // Real-time subscription for new messages
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('messages-inbox')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => fetchConversations()
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => fetchConversations()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, fetchConversations])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
      .neq('id', user?.id || '')
      .limit(10)
    setSearchResults(data || [])
  }

  const postNote = async () => {
    if (!user || !noteContent.trim()) return
    setPostingNote(true)
    try {
      const { error } = await supabase.from('notes').insert({
        user_id: user.id,
        content: noteContent.trim().slice(0, 60),
      })
      if (error) throw error
      toast.success('Note posted!')
      setNoteContent('')
      setShowNoteDialog(false)
      fetchNotes()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to post note')
    } finally {
      setPostingNote(false)
    }
  }

  return (
    <div className="pb-20">
      <TopBar
        title="Messages"
        right={
          <Button variant="ghost" size="icon" onClick={() => setShowNoteDialog(true)}>
            <Plus className="size-5" />
          </Button>
        }
      />
      <div className="max-w-lg mx-auto">
        {/* Notes bar */}
        {notes.length > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</p>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide">
              {notes.map(note => (
                <Link
                  key={note.id}
                  to={`/profile/${note.profiles?.username}`}
                  className="flex flex-col items-center gap-1 shrink-0 w-16"
                >
                  <Avatar className="size-12">
                    <AvatarImage src={note.profiles?.avatar_url} />
                    <AvatarFallback>{note.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <p className="text-xs text-center truncate w-full">{note.content}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-3">
          <Input
            placeholder="Search people to message..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="bg-muted/50"
          />
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {searchResults.map(p => (
                <Link
                  key={p.id}
                  to={`/messages/${p.username}`}
                  className="flex items-center gap-3 py-2 px-2 hover:bg-accent/50 rounded-lg"
                >
                  <Avatar className="size-10">
                    <AvatarImage src={p.avatar_url} />
                    <AvatarFallback>{p.username[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.username}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.full_name}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Conversations */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Spinner className="size-6" />
          </div>
        ) : conversations.length === 0 ? (
          <Empty className="mt-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircle className="size-6" />
              </EmptyMedia>
              <EmptyTitle>No messages yet</EmptyTitle>
              <EmptyDescription>Search for people above to start a conversation.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y divide-border">
            {conversations.map(conv => (
              <Link
                key={conv.user.id}
                to={`/messages/${conv.user.username}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50"
              >
                <div className="relative">
                  <Avatar className="size-12">
                    <AvatarImage src={conv.user.avatar_url} />
                    <AvatarFallback>{conv.user.username[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {conv.unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-xs font-bold rounded-full min-w-5 h-5 flex items-center justify-center px-1">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${conv.unreadCount > 0 ? 'font-semibold' : 'font-medium'}`}>
                    {conv.user.username}
                  </p>
                  <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {conv.lastMessage?.sender_id === user?.id && 'You: '}
                    {conv.lastMessage?.view_once && !conv.lastMessage?.view_once_opened
                      ? '📷 Photo'
                      : conv.lastMessage?.media_url && !conv.lastMessage?.content
                        ? conv.lastMessage?.media_type === 'audio' ? '🎤 Voice message' : '📷 Photo'
                        : conv.lastMessage?.content || ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {conv.lastMessage && formatDistanceToNow(new Date(conv.lastMessage.created_at), { addSuffix: false })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <BottomNav />

      {/* Note dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Share a note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Notes disappear after 24 hours. Share what&apos;s on your mind!
            </p>
            <Input
              placeholder="What's on your mind?"
              value={noteContent}
              onChange={e => setNoteContent(e.target.value.slice(0, 60))}
              maxLength={60}
              onKeyDown={e => e.key === 'Enter' && postNote()}
            />
            <p className="text-xs text-muted-foreground text-right">{noteContent.length}/60</p>
            <Button className="w-full" disabled={!noteContent.trim() || postingNote} onClick={postNote}>
              {postingNote ? <Spinner className="size-4 mr-2" /> : null}
              Share note
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
