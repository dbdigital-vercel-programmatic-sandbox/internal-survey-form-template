import { Button } from "@/components/ui/button"
import { LogInIcon } from "lucide-react"

export function LoginScreen({ loginUrl }: { loginUrl: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to continue</h1>
        <p className="text-muted-foreground text-sm">
          You need to be authenticated to access the CMS.
        </p>
        <Button asChild size="lg">
          <a href={loginUrl}>
            <LogInIcon data-icon="inline-start" />
            <span>Sign in</span>
          </a>
        </Button>
      </div>
    </div>
  )
}
