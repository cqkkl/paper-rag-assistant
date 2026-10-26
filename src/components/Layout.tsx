import { Outlet } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { PaperProvider } from "@/contexts/PaperContext";

export default function Layout() {
  return (
    <PaperProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </PaperProvider>
  );
}