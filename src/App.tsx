import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { Outlet, RouterProvider, createBrowserRouter } from "react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ToastRegion } from "@/components/ui/ToastRegion";
import { useTransitionState } from "@/hooks/useTransitionMember";
import { focusRouteHeading } from "@/lib/viewTransitions";
import { LicensesPage } from "@/pages/LicensesPage";
import { MemberDetailPage } from "@/pages/MemberDetailPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RosterPage } from "@/pages/RosterPage";
import { UpdateDetailsPage } from "@/pages/UpdateDetailsPage";

function AppShell() {
  const transitionState = useTransitionState();

  useEffect(() => {
    const onPopState = () => {
      focusRouteHeading();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return (
    <div className="grid min-h-[100dvb] grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto]">
      <SiteHeader />
      <main
        className="site-main w-full min-w-0"
        style={
          transitionState.mode !== "filter"
            ? ({ viewTransitionName: "page-main" } as React.CSSProperties)
            : undefined
        }
      >
        <Outlet />
      </main>
      <SiteFooter />
      <ToastRegion />
    </div>
  );
}

// Data router so the editor can block navigation with useBlocker while dirty.
const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <RosterPage /> },
      { path: "/member/:slug", element: <MemberDetailPage /> },
      { path: "/licenses", element: <LicensesPage /> },
      { path: "/update_details", element: <UpdateDetailsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  );
}

export default App;