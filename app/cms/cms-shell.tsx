"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { authClient } from "@/lib/internal/auth-client"
import { ClipboardList, DatabaseIcon, LogOutIcon } from "lucide-react"
import Link from "next/link"

type Session = {
  user: { id: string; name: string; email: string }
  session: { id: string }
}

export function CmsShell({
  session,
  children,
}: {
  session: Session
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <span className="truncate px-2 text-sm font-semibold">CMS</span>
          </SidebarHeader>

          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Survey responses">
                  <Link href="/cms">
                    <ClipboardList />
                    <span>Survey</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Migrations">
                  <Link href="/cms/migrations">
                    <DatabaseIcon />
                    <span>Migrations</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Sign out"
                  onClick={async () => {
                    await authClient.signOut()
                    window.location.href = "/"
                  }}
                >
                  <LogOutIcon />
                  <span className="truncate">{session.user.email}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b px-4">
            <SidebarTrigger />
          </header>
          <div className="flex-1">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
