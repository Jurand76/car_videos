import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { ServiceClient } from "./service-client";

export default async function ServicePage() {
  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login?callbackUrl=/service");
  }

  return <ServiceClient accessToken={session.accessToken} />;
}
