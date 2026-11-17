import { ChevronsUpDownIcon, LogOutIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { useAuth } from '@/features/auth/auth-context'
import { useDisplayName } from '@/features/profile/use-profile'

function initials(text: string): string {
  const parts = text.split(/[\s@._-]+/).filter(Boolean)
  const letters =
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : text.slice(0, 2)
  return letters.toUpperCase()
}

function UserIdentity({ name, email }: { name: string; email: string | undefined }) {
  return (
    <>
      <Avatar className="size-8 rounded-lg" aria-hidden="true">
        {/* The initials are drawn by CSS: they are not text, so the button's visible text (and its
            accessible name, label in name) is the name and the email only. */}
        <AvatarFallback
          data-initials={initials(name)}
          className="rounded-lg text-foreground before:content-[attr(data-initials)]"
        />
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        {/* A space between the lines, so the visible text reads "name email" (label in name). */}
        {email && ' '}
        {email && <span className="truncate text-xs text-muted-foreground">{email}</span>}
      </div>
    </>
  )
}

export function NavUser() {
  const { t } = useTranslation()
  const { isMobile } = useSidebar()
  const { user, signOut } = useAuth()
  const displayName = useDisplayName()
  const email = user?.email
  const name = displayName ?? email ?? t('userMenu.fallbackName')

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            aria-label={t('userMenu.open', {
              identity: displayName && email ? `${name} ${email}` : name,
            })}
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <UserIdentity name={name} email={displayName ? email : undefined} />
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-56 rounded-lg"
          side={isMobile ? 'top' : 'right'}
          align="end"
          sideOffset={4}
        >
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm text-foreground">
              <UserIdentity name={name} email={displayName ? email : undefined} />
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOutIcon />
            {t('userMenu.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}
