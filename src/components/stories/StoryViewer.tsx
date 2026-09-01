import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Story, Profile } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { X, Send, Eye } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

type StoryGroup = {
  user: Profile
  stories: Story[]
}

type StoryViewerProps = {
  groups: StoryGroup[]
  initialGroupIndex: number
  onClose: () => void
}

export default function StoryViewer({ groups, initialGroupIndex, onClose }: StoryViewerProps) {
  const { user } = useAuth()
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex)
  const [storyIndex, setStoryIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reply, setReply] = useState('')
  const [showViewers, setShowViewers] = useState(false)
  const [viewers, setViewers] = useState<Profile[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const DURATION = 5000

  const currentGroup = groups[groupIndex]
  const currentStory = currentGroup?.stories[storyIndex]

  useEffect(() => {
    if (currentStory && user) {
      supabase.from('story_views').upsert({
        story_id: currentStory.id,
        viewer_id: user.id,
      }, { onConflict: 'story_id,viewer_id' })
    }
  }, [currentStory?.id, user])

  useEffect(() => {
    if (paused) return
    intervalRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          advance()
          return 0
        }
        return p + (100 / (DURATION / 100))
      })
    }, 100)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [groupIndex, storyIndex, paused])

  const advance = () => {
    setProgress(0)
    const group = groups[groupIndex]
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex(s => s + 1)
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex(g => g + 1)
      setStoryIndex(0)
    } else {
      onClose()
    }
  }

  const goBack = () => {
    setProgress(0)
    if (storyIndex > 0) {
      setStoryIndex(s => s - 1)
    } else if (groupIndex > 0) {
      setGroupIndex(g => g - 1)
      setStoryIndex(groups[groupIndex - 1].stories.length - 1)
    }
  }

  const loadViewers = async () => {
    if (!currentStory) return
    const { data } = await supabase
      .from('story_views')
      .select('viewer_id, profiles!viewer_id(id, username, full_name, avatar_url, is_verified)')
      .eq('story_id', currentStory.id)
    setViewers((data?.map(v => v.profiles as unknown as Profile) || []))
    setShowViewers(true)
  }

  const sendReply = async () => {
    if (!reply.trim() || !user || !currentGroup) return
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: currentGroup.user.id,
      content: reply,
    })
    toast.success('Reply sent!')
    setReply('')
  }

  if (!currentStory) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div className="relative w-full max-w-sm h-full">
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-2 pt-safe">
          {currentGroup.stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-none"
                style={{
                  width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%'
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-4 left-0 right-0 z-20 flex items-center gap-3 px-4 pt-4">
          <Avatar className="size-8 ring-2 ring-white/50">
            <AvatarImage src={currentGroup.user.avatar_url} />
            <AvatarFallback>{currentGroup.user.username[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-none">{currentGroup.user.username}</p>
            <p className="text-white/60 text-xs mt-0.5">
              {new Date(currentStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 size-8"
            onClick={onClose}
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Media */}
        <div
          className="w-full h-full"
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
        >
          {currentStory.media_type === 'video' ? (
            <video
              src={currentStory.media_url}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />
          ) : (
            <img
              src={currentStory.media_url}
              className="w-full h-full object-cover"
              alt=""
            />
          )}
        </div>

        {/* Caption */}
        {currentStory.caption && (
          <div className="absolute bottom-24 left-0 right-0 px-4">
            <p className="text-white text-sm text-shadow drop-shadow-lg">{currentStory.caption}</p>
          </div>
        )}

        {/* Navigation areas */}
        <button
          className="absolute left-0 top-14 bottom-20 w-1/3 z-10"
          onClick={goBack}
        />
        <button
          className="absolute right-0 top-14 bottom-20 w-1/3 z-10"
          onClick={advance}
        />

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-safe space-y-2">
          {currentGroup.user.id === user?.id ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full bg-black/40 border-white/30 text-white hover:bg-white/20"
              onClick={loadViewers}
            >
              <Eye className="size-4 mr-2" />
              View viewers
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder={`Reply to ${currentGroup.user.username}...`}
                value={reply}
                onChange={e => setReply(e.target.value)}
                className="bg-black/40 border-white/30 text-white placeholder:text-white/50 flex-1"
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                onKeyDown={e => e.key === 'Enter' && sendReply()}
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={sendReply}
              >
                <Send className="size-5" />
              </Button>
            </div>
          )}
        </div>

        {/* Viewers sheet */}
        {showViewers && (
          <div className="absolute inset-x-0 bottom-0 z-30 bg-card rounded-t-2xl max-h-[60%] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Viewers ({viewers.length})</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowViewers(false)}>
                <X className="size-4" />
              </Button>
            </div>
            {viewers.map(v => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar className="size-9">
                  <AvatarImage src={v.avatar_url} />
                  <AvatarFallback>{v.username[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{v.username}</p>
                  <p className="text-xs text-muted-foreground">{v.full_name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
