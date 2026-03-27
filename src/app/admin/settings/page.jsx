"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";

export default function SettingsMainPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to store settings as the default
    router.push("/admin/settings/store");
  }, [router]);

  return (
    <div className="flex justify-center items-center h-[calc(100vh-120px)] lg:h-[calc(100vh-200px)]">
      <div className="text-center">
        <Spinner color="secondary" variant="gradient" size="md" />
        <p className="text-gray-600 mt-3 text-sm lg:text-base">Redirecting to settings...</p>
      </div>
    </div>
  );
}
