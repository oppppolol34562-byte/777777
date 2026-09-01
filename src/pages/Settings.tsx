import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { LogOut, ChevronRight, Shield, Bell, Eye, MessageSquare, QrCode as QrIcon } from 'lucide-react'

export default function Settings() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [isPrivate, setIsPrivate] = useState(false)
  const [showSeenReceipts, setShowSeenReceipts] = useState(true)
  const [showFollowersTo, setShowFollowersTo] = useState<'everyone' | 'followers' | 'nobody'>('everyone')
  const [whoCanMessage, setWhoCanMessage] = useState<'everyone' | 'followers' | 'nobody'>('everyone')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setIsPrivate(profile.is_private)
      setShowSeenReceipts(profile.show_seen_receipts)
      setShowFollowersTo(profile.show_followers_to)
      setWhoCanMessage(profile.who_can_message)
    }
  }, [profile])

  const saveSetting = async (field: string, value: boolean | string) => {
    if (!user) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [field]: value })
        .eq('id', user.id)
      if (error) throw error
      await refreshProfile()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="pb-20">
      <TopBar title="Settings" showBack />
      <div className="max-w-lg mx-auto px-4 py-4">
        {/* Privacy Section */}
        <div className="space-y-1 mb-6">
          <div className="flex items-center gap-2 px-2 py-2">
            <Shield className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Privacy</h2>
          </div>

          <div className="flex items-center justify-between py-3 px-2">
            <div className="flex-1">
              <Label className="text-sm font-medium">Private Account</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Only approved followers can see your posts
              </p>
            </div>
            <Switch
              checked={isPrivate}
              onCheckedChange={(v) => {
                setIsPrivate(v)
                saveSetting('is_private', v)
              }}
              disabled={saving}
            />
          </div>
          <Separator />

          <div className="py-3 px-2">
            <Label className="text-sm font-medium">Who can see your following list</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Control who sees who you follow
            </p>
            <Select
              value={showFollowersTo}
              onValueChange={(v) => {
                setShowFollowersTo(v as 'everyone' | 'followers' | 'nobody')
                saveSetting('show_followers_to', v)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="followers">Followers only</SelectItem>
                <SelectItem value="nobody">Nobody</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />

          <div className="flex items-center justify-between py-3 px-2">
            <div className="flex-1">
              <Label className="text-sm font-medium">Show read receipts</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Let others know you&apos;ve seen their messages
              </p>
            </div>
            <Switch
              checked={showSeenReceipts}
              onCheckedChange={(v) => {
                setShowSeenReceipts(v)
                saveSetting('show_seen_receipts', v)
              }}
              disabled={saving}
            />
          </div>
          <Separator />

          <div className="py-3 px-2">
            <Label className="text-sm font-medium">Who can message you</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Control who can send you direct messages
            </p>
            <Select
              value={whoCanMessage}
              onValueChange={(v) => {
                setWhoCanMessage(v as 'everyone' | 'followers' | 'nobody')
                saveSetting('who_can_message', v)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="followers">Followers only</SelectItem>
                <SelectItem value="nobody">Nobody</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Account Section */}
        <div className="space-y-1 mb-6">
          <div className="flex items-center gap-2 px-2 py-2">
            <Eye className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Account</h2>
          </div>

          <Link to="/edit-profile" className="flex items-center justify-between py-3 px-2 hover:bg-accent/50 rounded-lg">
            <span className="text-sm font-medium">Edit Profile</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
          <Separator />

          <button className="flex items-center justify-between py-3 px-2 w-full hover:bg-accent/50 rounded-lg">
            <span className="text-sm font-medium">QR Code</span>
            <QrIcon className="size-4 text-muted-foreground" />
          </button>
          <Separator />

          <Link to="/notifications" className="flex items-center justify-between py-3 px-2 hover:bg-accent/50 rounded-lg">
            <span className="text-sm font-medium">Notifications</span>
            <Bell className="size-4 text-muted-foreground" />
          </Link>
        </div>

        {/* Messages Section */}
        <div className="space-y-1 mb-6">
          <div className="flex items-center gap-2 px-2 py-2">
            <MessageSquare className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Messages</h2>
          </div>
          <Link to="/messages" className="flex items-center justify-between py-3 px-2 hover:bg-accent/50 rounded-lg">
            <span className="text-sm font-medium">Direct Messages</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </div>

        {/* Logout */}
        <Button
          variant="outline"
          className="w-full text-destructive hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="size-4 mr-2" />
          Log out
        </Button>
      </div>
      <BottomNav />
    </div>
  )
}
