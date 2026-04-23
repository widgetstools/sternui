import { useState } from "react";
import { Copy, CreditCard, Apple } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Switch } from "../components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  name: string;
  email: string;
  initials: string;
  role: string;
}

interface SaleEntry {
  name: string;
  email: string;
  initials: string;
  amount: string;
}

interface ShareUser {
  name: string;
  email: string;
  initials: string;
  permission: string;
}

interface NotificationSetting {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const teamMembers: TeamMember[] = [
  { name: "Sofia Davis", email: "sofia@example.com", initials: "SD", role: "Owner" },
  { name: "Jackson Lee", email: "jackson@example.com", initials: "JL", role: "Member" },
  { name: "Isabella Nguyen", email: "isabella@example.com", initials: "IN", role: "Member" },
  { name: "William Kim", email: "william@example.com", initials: "WK", role: "Viewer" },
];

const recentSales: SaleEntry[] = [
  { name: "Olivia Martin", email: "olivia.martin@email.com", initials: "OM", amount: "+$1,999.00" },
  { name: "Jackson Lee", email: "jackson.lee@email.com", initials: "JL", amount: "+$39.00" },
  { name: "Isabella Nguyen", email: "isabella.nguyen@email.com", initials: "IN", amount: "+$299.00" },
  { name: "William Kim", email: "will@email.com", initials: "WK", amount: "+$99.00" },
  { name: "Sofia Davis", email: "sofia.davis@email.com", initials: "SD", amount: "+$1,499.00" },
];

const shareUsers: ShareUser[] = [
  { name: "Olivia Martin", email: "m@example.com", initials: "OM", permission: "edit" },
  { name: "Isabella Nguyen", email: "b@example.com", initials: "IN", permission: "view" },
  { name: "Sofia Davis", email: "p@example.com", initials: "SD", permission: "view" },
];

const defaultNotifications: NotificationSetting[] = [
  {
    id: "communication",
    title: "Communication emails",
    description: "Receive emails about your account activity.",
    enabled: true,
  },
  {
    id: "marketing",
    title: "Marketing emails",
    description: "Receive emails about new products, features, and more.",
    enabled: false,
  },
  {
    id: "social",
    title: "Social emails",
    description: "Receive emails for friend requests, follows, and more.",
    enabled: true,
  },
  {
    id: "security",
    title: "Security emails",
    description: "Receive emails about your account security.",
    enabled: true,
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary ${className ?? ""}`}
    >
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card: Payment Method
// ---------------------------------------------------------------------------

function PaymentMethodCard() {
  const [method, setMethod] = useState<"card" | "paypal" | "apple">("card");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Method</CardTitle>
        <CardDescription>Add a new payment method to your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Button
            variant={method === "card" ? "outline" : "ghost"}
            className={`flex flex-col items-center gap-1 h-auto py-3 ${method === "card" ? "border-primary" : ""}`}
            onClick={() => setMethod("card")}
          >
            <CreditCard className="h-5 w-5" />
            <span className="text-xs">Card</span>
          </Button>
          <Button
            variant={method === "paypal" ? "outline" : "ghost"}
            className={`flex flex-col items-center gap-1 h-auto py-3 ${method === "paypal" ? "border-primary" : ""}`}
            onClick={() => setMethod("paypal")}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" />
            </svg>
            <span className="text-xs">Paypal</span>
          </Button>
          <Button
            variant={method === "apple" ? "outline" : "ghost"}
            className={`flex flex-col items-center gap-1 h-auto py-3 ${method === "apple" ? "border-primary" : ""}`}
            onClick={() => setMethod("apple")}
          >
            <Apple className="h-5 w-5" />
            <span className="text-xs">Apple</span>
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="First Last" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="card-number">Card number</Label>
          <Input id="card-number" placeholder="" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="expires">Expires</Label>
            <Select>
              <SelectTrigger id="expires">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="01">January</SelectItem>
                <SelectItem value="02">February</SelectItem>
                <SelectItem value="03">March</SelectItem>
                <SelectItem value="04">April</SelectItem>
                <SelectItem value="05">May</SelectItem>
                <SelectItem value="06">June</SelectItem>
                <SelectItem value="07">July</SelectItem>
                <SelectItem value="08">August</SelectItem>
                <SelectItem value="09">September</SelectItem>
                <SelectItem value="10">October</SelectItem>
                <SelectItem value="11">November</SelectItem>
                <SelectItem value="12">December</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">Year</Label>
            <Select>
              <SelectTrigger id="year">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2027">2027</SelectItem>
                <SelectItem value="2028">2028</SelectItem>
                <SelectItem value="2029">2029</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cvc">CVC</Label>
          <Input id="cvc" placeholder="CVC" />
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Continue</Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Card: Team Members
// ---------------------------------------------------------------------------

function TeamMembersCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Members</CardTitle>
        <CardDescription>Invite your team members to collaborate.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {teamMembers.map((member) => (
          <div key={member.email} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar initials={member.initials} />
              <div>
                <p className="text-sm font-medium leading-none">{member.name}</p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
            </div>
            <Select defaultValue={member.role.toLowerCase()}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Card: Report an Issue
// ---------------------------------------------------------------------------

function ReportIssueCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Report an issue</CardTitle>
        <CardDescription>What area are you having problems with?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="area">Area</Label>
            <Select defaultValue="team">
              <SelectTrigger id="area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="account">Account</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="security-level">Security Level</Label>
            <Select defaultValue="2">
              <SelectTrigger id="security-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Severity 1 (Highest)</SelectItem>
                <SelectItem value="2">Severity 2</SelectItem>
                <SelectItem value="3">Severity 3</SelectItem>
                <SelectItem value="4">Severity 4</SelectItem>
                <SelectItem value="5">Severity 5 (Lowest)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" placeholder="I need help with..." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            placeholder="Please include all information relevant to your issue."
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="ghost">Cancel</Button>
        <Button>Submit</Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Card: Share Document
// ---------------------------------------------------------------------------

function ShareDocumentCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Share this document</CardTitle>
        <CardDescription>Anyone with the link can view this document.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input value="http://example.com/link/to/document" readOnly className="flex-1" />
          <Button variant="secondary" size="sm" className="shrink-0">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <Separator />
        <div className="space-y-4">
          <h4 className="text-sm font-medium">People with access</h4>
          {shareUsers.map((user) => (
            <div key={user.email} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar initials={user.initials} />
                <div>
                  <p className="text-sm font-medium leading-none">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Select defaultValue={user.permission}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edit">Can edit</SelectItem>
                  <SelectItem value="view">Can view</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Card: Notifications
// ---------------------------------------------------------------------------

function NotificationsCard() {
  const [notifications, setNotifications] =
    useState<NotificationSetting[]>(defaultNotifications);

  const toggle = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n)),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose what you want to be notified about.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notifications.map((n) => (
          <div key={n.id} className="flex items-center justify-between space-x-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium leading-none">{n.title}</p>
              <p className="text-sm text-muted-foreground">{n.description}</p>
            </div>
            <Switch checked={n.enabled} onCheckedChange={() => toggle(n.id)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Card: Recent Sales
// ---------------------------------------------------------------------------

function RecentSalesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Sales</CardTitle>
        <CardDescription>You made 265 sales this month.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {recentSales.map((sale) => (
          <div key={sale.email} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar initials={sale.initials} />
              <div>
                <p className="text-sm font-medium leading-none">{sale.name}</p>
                <p className="text-sm text-muted-foreground">{sale.email}</p>
              </div>
            </div>
            <span className="font-mono text-sm font-medium">{sale.amount}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      {/* Left column */}
      <div className="space-y-6">
        <PaymentMethodCard />
        <TeamMembersCard />
      </div>

      {/* Right column */}
      <div className="space-y-6">
        <ReportIssueCard />
        <ShareDocumentCard />
        <NotificationsCard />
      </div>

      {/* Bottom full-width */}
      <div className="lg:col-span-2">
        <RecentSalesCard />
      </div>
    </div>
  );
}
