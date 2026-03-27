"use client";
import React from "react";
import Header from "./Header";
import { usePathname } from "next/navigation";

const MainHeader = () => {
  const pathname = usePathname();

  if (pathname === "/admin" || pathname === "/login" || pathname.startsWith("/admin/")) {
    return null;
  }

  return <Header />;
};

export default MainHeader;
