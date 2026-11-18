import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { BrowserRouter, Route, Routes } from "react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
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
        <Routes>
          <Route path="/" element={<RosterPage />} />
          <Route path="/member/:slug" element={<MemberDetailPage />} />
          <Route path="/licenses" element={<LicensesPage />} />
          <Route path="/update_details" element={<UpdateDetailsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </MotionConfig>
  );
}

export default App;
