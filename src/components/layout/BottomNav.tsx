import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Search, PlusSquare, Heart, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

export default function BottomNav() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/explore', icon: Search, label: 'Explore' },
    { to: '/create', icon: PlusSquare, label: 'Create' },
    { to: '/notifications', icon: Heart, label: 'Activity' },
    { to: `/profile/${profile?.username}`, icon: User, label: 'Profile' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
      <div className="flex items-center justify-around max-w-lg mx-auto h-14 px-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={label === 'Create' ? (e) => { e.preventDefault(); navigate('/create') } : undefined}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 p-2 rounded-lg transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            {label === 'Profile' && profile?.avatar_url ? (
              <div className="size-7 rounded-full overflow-hidden ring-2 ring-transparent [.active_&]:ring-foreground">
                <img src={profile.avatar_url} alt="" className="size-full object-cover" />
              </div>
            ) : (
              <Icon className="size-6 stroke-[1.5]" />
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
