import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Camera, X } from 'lucide-react'

export default function CreateStory() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [caption, setCaption] = useState('')
  const [expiration, setExpiration] = useState('24')
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadMedia = async (file: File) => {
    if (!user) return
    setUploading(true)
    try {
      const isVideo = file.type.startsWith('video/')
      const ext = file.name.split('.').pop()
      const path = `stories/${user.id}-${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('posts')
        .upload(path, file, { upsert: true })

      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage
        .from('posts')
        .getPublicUrl(path)

      setMediaUrl(publicUrl)
      setMediaType(isVideo ? 'video' : 'image')
      toast.success('Media uploaded')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handlePost = async () => {
    if (!user) return
    if (!mediaUrl) {
      toast.error('Please add a photo or video')
      return
    }
    setPosting(true)
    try {
      const hours = parseInt(expiration)
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

      const { error } = await supabase.from('stories').insert({
        user_id: user.id,
        media_url: mediaUrl,
        media_type: mediaType,
        caption: caption.trim(),
        expires_at: expiresAt,
      })
      if (error) throw error
      toast.success('Story posted!')
      navigate('/')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to post story')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="pb-20">
      <TopBar
        title="New Story"
        showBack
        right={
          <Button
            variant="ghost"
            size="sm"
            className="text-primary font-semibold"
            disabled={!mediaUrl || posting}
            onClick={handlePost}
          >
            {posting ? <Spinner className="size-4" /> : 'Share'}
          </Button>
        }
      />
      <div className="max-w-lg mx-auto px-4 py-4">
        {!mediaUrl ? (
          <div
            className="aspect-[9/16] max-h-[500px] border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-accent/30 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Spinner className="size-8" />
            ) : (
              <>
                <Camera className="size-12 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">Tap to upload a photo or video</p>
                  <p className="text-xs text-muted-foreground mt-1">Stories disappear after expiration</p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="relative aspect-[9/16] max-h-[500px] rounded-xl overflow-hidden bg-muted">
            {mediaType === 'video' ? (
              <video src={mediaUrl} className="w-full h-full object-cover" controls playsInline />
            ) : (
              <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
            )}
            <button
              className="absolute top-2 right-2 bg-black/60 rounded-full size-8 flex items-center justify-center"
              onClick={() => setMediaUrl('')}
            >
              <X className="size-4 text-white" />
            </button>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) uploadMedia(f)
          }}
        />

        <div className="mt-4">
          <Textarea
            placeholder="Add a caption..."
            value={caption}
            onChange={e => setCaption(e.target.value)}
            maxLength={100}
            className="resize-none min-h-16"
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label>Story expiration</Label>
          <Select value={expiration} onValueChange={setExpiration}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 hours</SelectItem>
              <SelectItem value="12">12 hours</SelectItem>
              <SelectItem value="24">24 hours (default)</SelectItem>
              <SelectItem value="48">2 days</SelectItem>
              <SelectItem value="72">3 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full mt-6"
          size="lg"
          disabled={!mediaUrl || posting}
          onClick={handlePost}
        >
          {posting ? <Spinner className="size-4 mr-2" /> : null}
          Share Story
        </Button>
      </div>
    </div>
  )
}
