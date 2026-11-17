import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { AppIcon } from '@/app/navigation'
import { paths } from '@/app/paths'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useCurrentBudget, useBudgets } from '@/features/budgets/current-budget-context'

/** Sidebar header: the budget I am working in, my other budgets, and "create budget". */
export function BudgetSwitcher() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const { budgets, selectBudget } = useBudgets()
  const { budget, isOwner } = useCurrentBudget()

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={budget.name}
              aria-label={t('budgetSwitcher.open', {
                name: budget.name,
                role: isOwner ? t('members.role.owner') : t('members.role.member'),
              })}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <AppIcon className="size-4" />
              </span>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold" data-testid="current-budget-name">
                  {budget.name}
                </span>
                {/* A space between the lines, so the visible text reads "name role" (label in name). */}{' '}
                <span className="truncate text-xs text-muted-foreground">
                  {isOwner ? t('members.role.owner') : t('members.role.member')}
                </span>
              </span>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t('budgetSwitcher.label')}
            </DropdownMenuLabel>
            {budgets.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => {
                  selectBudget(item.id)
                  closeOnMobile()
                }}
                className="gap-2"
              >
                <span className="flex-1 truncate">{item.name}</span>
                {item.id === budget.id && (
                  <CheckIcon className="size-4" aria-label={t('budgetSwitcher.current')} />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                closeOnMobile()
                void navigate(paths.newBudget)
              }}
            >
              <PlusIcon className="size-4" />
              {t('budgetSwitcher.create')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
