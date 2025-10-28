import * as React from "react";
import {
    Sidebar,
    SidebarProvider,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
} from "@/components/ui/sidebar"; // Ajusta según dónde tengas tus componentes
import { BarChart3, Bolt, Calculator, Calendar, Users } from "lucide-react";

const menuItems = [
    { title: "Resumen", icon: BarChart3, href: "/dashboard", isActive: false },
    { title: "Usuarios", icon: Users, href: "/usuarios", isActive: false },
    { title: "Calcular", icon: Calculator, href: "/calculadora", isActive: false },
    { title: "Cálculo masivo", icon: Calculator, href: "/calculoMasivo", isActive: false },
    { title: "Calendario", icon: Calendar, href: "/calendario", isActive: false },
    { title: "Configuración", icon: Bolt, href: "/configuracion", isActive: false },
];


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";

    return (
        <SidebarProvider>
            <div className="flex min-h-screen w-full">
                <Sidebar>
                    <SidebarContent>
                        <SidebarGroup>
                            <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {menuItems.map((item) => {
                                        const active = pathname === item.href;
                                        return (
                                            <SidebarMenuItem key={item.title}>
                                                <SidebarMenuButton asChild isActive={active}>
                                                    <a href={item.href} className="flex items-center space-x-2">
                                                        <item.icon className="w-4 h-4" />
                                                        <span>{item.title}</span>
                                                    </a>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        );
                                    })}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    </SidebarContent>
                </Sidebar>

                <main className="flex-1 p-6 bg-gray-50 dark:bg-gray-900">{children}</main>
            </div>
        </SidebarProvider>
    );
}
