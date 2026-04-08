"use client";
import React from "react";
import Footer from "./Footer";
import { usePathname } from "next/navigation";

const MainFooterWrapper = () => {
  const pathname = usePathname();

  if (
    pathname === "/admin" ||
    pathname === "/login" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/checkout/") ||
    pathname.startsWith("/offer/")
  ) {
    return null;
  }

  return <Footer />;
};

export default MainFooterWrapper;
