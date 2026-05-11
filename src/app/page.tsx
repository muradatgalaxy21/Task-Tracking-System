// -------------------------------------------------------------------
// Root Page
// Redirects to the dashboard (if authenticated) or login page.
// The middleware handles the actual auth check and redirect logic.
// -------------------------------------------------------------------

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}
