import { Link, useNavigate } from 'react-router-dom'
import { MessageCircle, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

type TopBarProps = {
  title?: string
  showBack?: boolean
  showLogo?: boolean
  right?: React.ReactNode
}

export default function TopBar({ title, showBack, showLogo = false, right }: TopBarProps) {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-40 bg-background border-b border-border">
      <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={() => navigate(-1)}
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          )}
          {showLogo && (
            <Link to="/">
              <h1 className="text-2xl font-bold tracking-tighter bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 bg-clip-text text-transparent">
                Yomy
              </h1>
            </Link>
          )}
          {title && !showLogo && (
            <h1 className="text-lg font-semibold">{title}</h1>
          )}
        </div>
        <div className="flex items-center gap-1">
          {right || (
            showLogo && (
              <>
                <Button variant="ghost" size="icon" className="size-9" asChild>
                  <Link to="/settings">
                    <Settings className="size-5 stroke-[1.5]" />
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" className="size-9" asChild>
                  <Link to="/messages">
                    <MessageCircle className="size-5 stroke-[1.5]" />
                  </Link>
                </Button>
              </>
            )
          )}
        </div>
      </div>
    </header>
  )
}
