import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useMatch } from 'react-router'

import { AppIcon, mainNavItems, secondaryNavItems, type NavItem } from '@/app/navigation'
import { paths } from '@/app/paths'
import { NavPreferences } from '@/components/layout/nav-preferences'
import { NavUser } from '@/components/layout/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'

function NavEntry({ item: { key, path, icon: Icon } }: { item: NavItem }) {
  const { t } = useTranslation()
  const { isMobile, setOpenMobile } = useSidebar()
  const isActive = useMatch({ path, end: path === paths.dashboard }) !== null
  const label = t(`nav.${key}`)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <NavLink
          to={path}
          end={path === paths.dashboard}
          onClick={() => {
            if (isMobile) setOpenMobile(false)
          }}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function NavItems({ items }: { items: NavItem[] }) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <NavEntry key={item.key} item={item} />
      ))}
    </SidebarMenu>
  )
}

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={t('app.name')}>
              <Link to={paths.dashboard}>
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <AppIcon className="size-4" />
                </span>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{t('app.name')}</span>
                  <span className="truncate text-xs text-muted-foreground">CHF</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.label')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={mainNavItems} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <NavItems items={secondaryNavItems} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator className="mx-0" />
      <SidebarFooter>
        <SidebarMenu>
          <NavPreferences />
          <NavUser />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
