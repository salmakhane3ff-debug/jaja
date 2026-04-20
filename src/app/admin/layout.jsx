"use client";

import { useState, useLayoutEffect } from "react";
import { HeroUIProvider } from "@heroui/react";
// PERF: SunEditor CSS scoped to admin only — removed from root layout.jsx.
//       This prevents ~300 KB of editor CSS loading on public storefront pages.
import "suneditor/dist/css/suneditor.min.css";
import SideBar from "@/components/admin/SideBar";
import Header from "@/components/admin/Header";

// PERF: Custom SunEditor theme styles (previously in globals.css) are now
//       co-located here so only admin users pay the CSS parsing cost.
const sunEditorStyles = `
  .sun-editor {
    border-radius: 8px;
    border-bottom: none !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    min-height: 500px;
  }
  .sun-editor .se-toolbar {
    background-color: #f9fafb;
    border-bottom: none !important;
    border-radius: 8px 8px 0 0;
  }
  .sun-editor .se-wrapper {
    border-radius: 0 0 8px 8px;
    min-height: 150px;
  }
  .se-resizing-bar { display: none !important; }
`;

export default function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Force <html dir="ltr"> for the entire admin session.
  // dir="ltr" on a child div is NOT enough — Tailwind rtl: variants use
  // [dir="rtl"] selectors anchored to <html>, so we must control the root.
  // MutationObserver catches and reverts any RTL set by LanguageContext
  // or the localStorage inline script before React hydrates.
  // useLayoutEffect fires BEFORE the browser paints — eliminates the RTL flash.
  // useEffect fires after paint → user sees RTL for one frame → that was the bug.
  useLayoutEffect(() => {
    const html = document.documentElement;

    function enforceLTR() {
      if (html.getAttribute("dir") !== "ltr") {
        html.setAttribute("dir", "ltr");
      }
    }

    enforceLTR(); // set before browser paints

    const observer = new MutationObserver(enforceLTR);
    observer.observe(html, { attributes: true, attributeFilter: ["dir"] });

    return () => {
      observer.disconnect();
      // Restore the user's stored language direction when leaving admin
      try {
        const stored = localStorage.getItem("store_lang");
        html.setAttribute("dir", stored === "ar" ? "rtl" : "ltr");
      } catch {
        html.setAttribute("dir", "rtl");
      }
    };
  }, []);

  return (
    // PERF: HeroUIProvider scoped to admin layout — removed from global providers.tsx.
    //       Admin pages use HeroUI components extensively; public pages don't need it.
    <HeroUIProvider>
      <style dangerouslySetInnerHTML={{ __html: sunEditorStyles }} />
      <div className="min-h-screen bg-gray-50" dir="ltr">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="flex">
          {/* Desktop Sidebar */}
          <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:top-12 lg:bg-white lg:border-r lg:border-gray-200">
            <div className="flex-1 flex flex-col min-h-0 pt-5 pb-4 overflow-y-auto">
              <div className="px-3">
                <SideBar />
              </div>
            </div>
          </div>

          {/* Mobile Sidebar Overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div
                className="fixed inset-0 bg-gray-600 bg-opacity-75"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
                <div className="absolute top-0 right-0 -mr-12 pt-2">
                  <button
                    className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="sr-only">Close sidebar</span>
                    <svg
                      className="h-6 w-6 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 h-0 pt-16 pb-4 overflow-y-auto">
                  <div className="px-3">
                    <SideBar onItemClick={() => setSidebarOpen(false)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 lg:pl-64">
            <div className="pt-16 px-4 sm:px-6 lg:px-8">{children}</div>
          </div>
        </div>
      </div>
    </HeroUIProvider>
  );
}
