import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import PaperSidebar from "@/components/PaperSidebar";
import { PaperProvider } from "@/contexts/PaperContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export default function Layout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <PaperProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <div className="hidden h-full md:block">
          <PaperSidebar />
        </div>
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="fixed left-3 top-3 z-40 bg-background/90 shadow-sm backdrop-blur md:hidden"
            aria-label="打开文献库"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Outlet />
        </main>
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-[88vw] max-w-[340px] gap-0 p-0">
            <SheetTitle className="sr-only">文献库</SheetTitle>
            <SheetDescription className="sr-only">上传、选择和管理本地文献</SheetDescription>
            <PaperSidebar mobile onNavigate={() => setMobileSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </PaperProvider>
  );
}
