import { useEffect } from "react";
import { useRouter } from "next/router";

// Host-owned page at /google-callback. Lives in root pages/ so it survives
// `npm run copy-shared`. Concrete route — takes precedence over the Plasmic
// [[...catchall]] page.
//
// Pages Router equivalent of Elbrit's app/google-callback/GoogleCallbackContent.jsx.
export default function GoogleCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // router.query is empty until the router is ready on first client render.
    if (!router.isReady) return;

    const code = router.query.code;
    const stateRaw = router.query.state;

    if (!code || !stateRaw) return;

    let stateData;
    try {
      stateData = JSON.parse(decodeURIComponent(stateRaw));
    } catch (error) {
      console.error("Invalid Google callback state", error);
      return;
    }

    const { email, erpUrl, authToken } = stateData;

    async function connect() {
      try {
        const response = await fetch("/api/google-calendar/connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code,
            email,
            authToken,
            erpUrl,
          }),
        });

        const data = await response.json();

        console.log("Google connect response", data);

        if (!response.ok) {
          throw new Error(data?.message || "Google connection failed");
        }

        router.push("/");
      } catch (error) {
        console.error("Google connect error", error);
      }
    }

    connect();
  }, [router.isReady, router.query.code, router.query.state]);

  return <div className="p-4">Connecting Google Calendar...</div>;
}
