import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import TopBar from '@/components/layout/TopBar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Camera } from 'lucide-react'

export default function EditProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setUsername(profile.username)
      setBio(profile.bio || '')
      setAvatarUrl(profile.avatar_url || '')
    }
  }, [profile])

  const uploadAvatar = async (file: File) => {
    if (!user) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `avatars/${user.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)
      setAvatarUrl(publicUrl)
      toast.success('Photo uploaded')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!user || !profile) return
    if (username.length < 3) {
      toast.error('Username must be at least 3 characters')
      return
    }
    setSaving(true)
    try {
      // Check username uniqueness if changed
      if (username !== profile.username) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.toLowerCase())
          .neq('id', user.id)
          .maybeSingle()
        if (existing) {
          toast.error('Username already taken')
          setSaving(false)
          return
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          username: username.toLowerCase(),
          bio,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id)

      if (error) throw error
      await refreshProfile()
      toast.success('Profile saved!')
      navigate(`/profile/${username}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      <TopBar
        title="Edit profile"
        showBack
        right={
          <Button
            variant="ghost"
            size="sm"
            className="text-primary font-semibold"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? <Spinner className="size-4" /> : 'Save'}
          </Button>
        }
      />
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="relative">
            <Avatar className="size-24 ring-2 ring-border">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="text-3xl">{profile.username[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <label className="absolute bottom-0 right-0 bg-primary rounded-full size-8 flex items-center justify-center ring-2 ring-background cursor-pointer">
              {uploading ? (
                <Spinner className="size-4 text-primary-foreground" />
              ) : (
                <Camera className="size-4 text-primary-foreground" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) uploadAvatar(f)
                }}
              />
            </label>
          </div>
          <p className="text-sm font-semibold text-primary">Change photo</p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value.replace(/[^a-z0-9_.]/gi, '').toLowerCase())}
              placeholder="username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Write a little about yourself..."
              maxLength={150}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{bio.length}/150</p>
          </div>
        </div>

        {/* Save button (prominent, as requested) */}
        <Button
          className="w-full mt-8"
          size="lg"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? <Spinner className="size-4 mr-2" /> : null}
          Save Changes
        </Button>
      </div>
    </div>
  )
}
