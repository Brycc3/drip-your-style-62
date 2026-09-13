import React from "react";
import { createRoot } from "react-dom/client";
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { Route as Shop } from "@/routes/_authenticated/shop";
import { Route as Profile } from "@/routes/_authenticated/profile";
import { Route as Generate } from "@/routes/_authenticated/generate";
import { Route as Home } from "@/routes/_authenticated/home";
import { Route as Closet } from "@/routes/_authenticated/closet.index";
import { Route as Saved } from "@/routes/_authenticated/saved";
import { Route as Swipe } from "@/routes/_authenticated/swipe";
import { Route as Inspo } from "@/routes/_authenticated/inspo";
import { Route as Scents } from "@/routes/_authenticated/scents";
import { Route as Taste } from "@/routes/_authenticated/taste";
import { Route as Feed } from "@/routes/_authenticated/feed";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "sonner";
import "@/styles.css";
const root = createRootRoute({
  component: () => (
    <>
      <div
        style={{
          background: "#c9ff32",
          color: "#111",
          padding: 8,
          textAlign: "center",
          fontSize: 12,
        }}
      >
        ISOLATED UI FIXTURES — not authenticated or live inventory
      </div>
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster />
    </>
  ),
});
const pages = {
  shop: Shop,
  profile: Profile,
  generate: Generate,
  home: Home,
  closet: Closet,
  saved: Saved,
  swipe: Swipe,
  scents: Scents,
  inspo: Inspo,
  taste: Taste,
  feed: Feed,
};
const authenticated = createRoute({
  getParentRoute: () => root,
  id: "_authenticated",
  component: Outlet,
});
const routes = Object.entries(pages).map(([path, r]) =>
  createRoute({
    getParentRoute: () => authenticated,
    path,
    component: r.options.component,
    validateSearch: r.options.validateSearch,
  }),
);
const router = createRouter({ routeTree: root.addChildren([authenticated.addChildren(routes)]) });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
