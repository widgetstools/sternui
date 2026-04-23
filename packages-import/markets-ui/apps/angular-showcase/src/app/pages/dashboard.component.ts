import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TextareaModule } from 'primeng/textarea';

/* ── Types ── */
interface TeamMember { name: string; email: string; initials: string; role: string; }
interface Sale { name: string; email: string; initials: string; amount: string; }
interface ShareUser { name: string; email: string; initials: string; permission: string; }
interface Notification { key: string; title: string; description: string; enabled: boolean; }
interface Option { label: string; value: string; }

/* ── Data ── */
const TEAM: TeamMember[] = [
  { name: 'Sofia Davis', email: 'sofia@example.com', initials: 'SD', role: 'owner' },
  { name: 'Jackson Lee', email: 'jackson@example.com', initials: 'JL', role: 'member' },
  { name: 'Isabella Nguyen', email: 'isabella@example.com', initials: 'IN', role: 'member' },
  { name: 'William Kim', email: 'william@example.com', initials: 'WK', role: 'viewer' },
];
const SALES: Sale[] = [
  { name: 'Olivia Martin', email: 'olivia.martin@email.com', initials: 'OM', amount: '+$1,999.00' },
  { name: 'Jackson Lee', email: 'jackson.lee@email.com', initials: 'JL', amount: '+$39.00' },
  { name: 'Isabella Nguyen', email: 'isabella.nguyen@email.com', initials: 'IN', amount: '+$299.00' },
  { name: 'William Kim', email: 'will@email.com', initials: 'WK', amount: '+$99.00' },
  { name: 'Sofia Davis', email: 'sofia.davis@email.com', initials: 'SD', amount: '+$1,499.00' },
];
const SHARE_USERS: ShareUser[] = [
  { name: 'Olivia Martin', email: 'm@example.com', initials: 'OM', permission: 'edit' },
  { name: 'Isabella Nguyen', email: 'b@example.com', initials: 'IN', permission: 'view' },
  { name: 'Sofia Davis', email: 'p@example.com', initials: 'SD', permission: 'view' },
];
const NOTIFICATIONS: Notification[] = [
  { key: 'comms', title: 'Communication emails', description: 'Receive emails about your account activity.', enabled: true },
  { key: 'marketing', title: 'Marketing emails', description: 'Receive emails about new products, features, and more.', enabled: false },
  { key: 'social', title: 'Social emails', description: 'Receive emails for friend requests, follows, and more.', enabled: true },
  { key: 'security', title: 'Security emails', description: 'Receive emails about your account security.', enabled: true },
];
const ROLES: Option[] = [
  { label: 'Owner', value: 'owner' }, { label: 'Member', value: 'member' }, { label: 'Viewer', value: 'viewer' },
];
const SHARE_ROLES: Option[] = [
  { label: 'Can edit', value: 'edit' }, { label: 'Can view', value: 'view' },
];
const MONTHS: Option[] = [
  { label: 'January', value: '01' }, { label: 'February', value: '02' },
  { label: 'March', value: '03' }, { label: 'April', value: '04' },
  { label: 'May', value: '05' }, { label: 'June', value: '06' },
  { label: 'July', value: '07' }, { label: 'August', value: '08' },
  { label: 'September', value: '09' }, { label: 'October', value: '10' },
  { label: 'November', value: '11' }, { label: 'December', value: '12' },
];
const YEARS: Option[] = [
  { label: '2024', value: '2024' }, { label: '2025', value: '2025' },
  { label: '2026', value: '2026' }, { label: '2027', value: '2027' },
  { label: '2028', value: '2028' }, { label: '2029', value: '2029' },
];
const AREAS: Option[] = [
  { label: 'Team', value: 'team' }, { label: 'Billing', value: 'billing' }, { label: 'Account', value: 'account' },
];
const SEVERITIES: Option[] = [
  { label: 'Severity 1 (Highest)', value: '1' }, { label: 'Severity 2', value: '2' },
  { label: 'Severity 3', value: '3' }, { label: 'Severity 4', value: '4' },
  { label: 'Severity 5 (Lowest)', value: '5' },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonModule, InputTextModule, SelectModule, ToggleSwitchModule, TextareaModule],
  template: `
    <div class="grid gap-6 lg:grid-cols-[1fr_420px]">
      <!-- Left column -->
      <div class="space-y-6">
        <!-- Payment Method -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Payment Method</h3>
            <p class="card-desc">Add a new payment method to your account.</p>
          </div>
          <div class="card-content space-y-4">
            <div class="grid grid-cols-3 gap-4">
              @for (m of paymentMethods; track m.value) {
                <button class="payment-selector" [class.selected]="paymentMethod() === m.value"
                  (click)="paymentMethod.set(m.value)">
                  @if (m.value === 'card') {
                    <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                  }
                  @if (m.value === 'paypal') {
                    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/></svg>
                  }
                  @if (m.value === 'apple') {
                    <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/></svg>
                  }
                  <span class="text-xs">{{ m.label }}</span>
                </button>
              }
            </div>
            <div class="space-y-2"><label class="text-sm font-medium">Name</label><input pInputText placeholder="First Last" class="w-full" /></div>
            <div class="space-y-2"><label class="text-sm font-medium">Card number</label><input pInputText class="w-full" /></div>
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2"><label class="text-sm font-medium">Expires</label><p-select [options]="months" placeholder="Month" optionLabel="label" optionValue="value" styleClass="w-full" /></div>
              <div class="space-y-2"><label class="text-sm font-medium">Year</label><p-select [options]="years" placeholder="Year" optionLabel="label" optionValue="value" styleClass="w-full" /></div>
            </div>
            <div class="space-y-2"><label class="text-sm font-medium">CVC</label><input pInputText placeholder="CVC" class="w-full" /></div>
          </div>
          <div class="card-footer"><button pButton label="Continue" class="w-full continue-btn"></button></div>
        </div>
        <!-- Team Members -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">Team Members</h3><p class="card-desc">Invite your team members to collaborate.</p></div>
          <div class="card-content space-y-4">
            @for (member of team(); track member.email; let i = $index) {
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3"><div class="avatar">{{ member.initials }}</div><div><p class="text-sm font-medium leading-none">{{ member.name }}</p><p class="text-sm text-muted-foreground">{{ member.email }}</p></div></div>
                <p-select [options]="roles" [ngModel]="member.role" (ngModelChange)="updateTeamRole(i, $event)" optionLabel="label" optionValue="value" styleClass="w-28" />
              </div>
            }
          </div>
        </div>
      </div>
      <!-- Right column -->
      <div class="space-y-6">
        <!-- Report an Issue -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">Report an issue</h3><p class="card-desc">What area are you having problems with?</p></div>
          <div class="card-content space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2"><label class="text-sm font-medium">Area</label><p-select [options]="areas" optionLabel="label" optionValue="value" styleClass="w-full" [ngModel]="areaValue()" (ngModelChange)="areaValue.set($event)" /></div>
              <div class="space-y-2"><label class="text-sm font-medium">Security Level</label><p-select [options]="severities" optionLabel="label" optionValue="value" styleClass="w-full" [ngModel]="severityValue()" (ngModelChange)="severityValue.set($event)" /></div>
            </div>
            <div class="space-y-2"><label class="text-sm font-medium">Subject</label><input pInputText placeholder="I need help with..." class="w-full" /></div>
            <div class="space-y-2"><label class="text-sm font-medium">Description</label><textarea pTextarea placeholder="Please include all information relevant to your issue." class="w-full" [rows]="3"></textarea></div>
          </div>
          <div class="card-footer flex justify-between"><button pButton label="Cancel" [text]="true" class="cancel-btn"></button><button pButton label="Submit" severity="primary" class="submit-btn"></button></div>
        </div>
        <!-- Share Document -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">Share this document</h3><p class="card-desc">Anyone with the link can view this document.</p></div>
          <div class="card-content space-y-4">
            <div class="flex gap-2"><input pInputText value="http://example.com/link/to/document" readonly class="flex-1" /><button pButton icon="pi pi-copy" severity="secondary" class="shrink-0 copy-btn"></button></div>
            <hr class="border-border" />
            <div class="space-y-4">
              <h4 class="text-sm font-medium">People with access</h4>
              @for (user of shareUsers(); track user.email; let i = $index) {
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3"><div class="avatar">{{ user.initials }}</div><div><p class="text-sm font-medium leading-none">{{ user.name }}</p><p class="text-sm text-muted-foreground">{{ user.email }}</p></div></div>
                  <p-select [options]="shareRoles" [ngModel]="user.permission" (ngModelChange)="updateSharePermission(i, $event)" optionLabel="label" optionValue="value" styleClass="w-28" />
                </div>
              }
            </div>
          </div>
        </div>
        <!-- Notifications -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">Notifications</h3><p class="card-desc">Choose what you want to be notified about.</p></div>
          <div class="card-content space-y-4">
            @for (n of notifications(); track n.key; let i = $index) {
              <div class="flex items-center justify-between gap-4">
                <div class="flex-1 space-y-1"><p class="text-sm font-medium leading-none">{{ n.title }}</p><p class="text-sm text-muted-foreground">{{ n.description }}</p></div>
                <p-toggleswitch [ngModel]="n.enabled" (ngModelChange)="updateNotification(i, $event)" />
              </div>
            }
          </div>
        </div>
      </div>
      <!-- Bottom full-width -->
      <div class="lg:col-span-2">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Recent Sales</h3><p class="card-desc">You made 265 sales this month.</p></div>
          <div class="card-content space-y-4">
            @for (sale of sales; track sale.email) {
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3"><div class="avatar">{{ sale.initials }}</div><div><p class="text-sm font-medium leading-none">{{ sale.name }}</p><p class="text-sm text-muted-foreground">{{ sale.email }}</p></div></div>
                <span class="font-mono text-sm font-medium">{{ sale.amount }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .card { border-radius: var(--mdl-radius, 0.5rem); border: 1px solid hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--card-foreground)); box-shadow: 0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1); }
    .card-header { display: flex; flex-direction: column; gap: 6px; padding: 24px; }
    .card-title { font-size: 18px; font-weight: 600; line-height: 1; letter-spacing: -0.025em; }
    .card-desc { font-size: 14px; color: hsl(var(--muted-foreground)); }
    .card-content { padding: 0 24px 24px; }
    .card-footer { display: flex; align-items: center; padding: 0 24px 24px; }
    .avatar { display: flex; width: 36px; height: 36px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 9999px; background: hsl(var(--primary) / 0.1); color: hsl(var(--primary)); font-size: 12px; font-weight: 500; }
    .payment-selector { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 0; border-radius: calc(var(--mdl-radius, 0.5rem) - 2px); border: 1px solid hsl(var(--border)); background: transparent; color: hsl(var(--foreground)); cursor: pointer; transition: border-color 0.15s, background 0.15s; }
    .payment-selector:hover:not(.selected) { background: hsl(var(--muted) / 0.5); }
    .payment-selector.selected { border-color: hsl(var(--primary)); }

    /* Component-specific button variants */
    :host ::ng-deep .continue-btn.p-button { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-color: hsl(var(--primary)); }
    :host ::ng-deep .continue-btn.p-button:hover { background: hsl(var(--primary) / 0.9); }
    :host ::ng-deep .cancel-btn.p-button { background: transparent; border-color: transparent; color: hsl(var(--foreground)); }
    :host ::ng-deep .cancel-btn.p-button:hover { background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); }
    :host ::ng-deep .submit-btn.p-button { --p-button-primary-background: hsl(var(--primary)); background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-color: hsl(var(--primary)); }
    :host ::ng-deep .submit-btn.p-button:hover { background: hsl(var(--primary) / 0.9); }
    :host ::ng-deep .copy-btn.p-button { background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); border-color: hsl(var(--secondary)); }
    :host ::ng-deep .copy-btn.p-button:hover { background: hsl(var(--secondary) / 0.8); }
  `],
})
export class DashboardComponent {
  paymentMethod = signal('card');
  paymentMethods = [
    { value: 'card', label: 'Card' },
    { value: 'paypal', label: 'Paypal' },
    { value: 'apple', label: 'Apple' },
  ];
  months = MONTHS;
  years = YEARS;
  roles = ROLES;
  areas = AREAS;
  severities = SEVERITIES;
  shareRoles = SHARE_ROLES;
  sales = SALES;
  readonly areaValue = signal('team');
  readonly severityValue = signal('2');
  readonly team = signal(TEAM.map(m => ({ ...m })));
  readonly shareUsers = signal(SHARE_USERS.map(u => ({ ...u })));
  readonly notifications = signal(NOTIFICATIONS.map(n => ({ ...n })));

  updateTeamRole(index: number, role: string): void {
    this.team.update(arr => arr.map((m, i) => i === index ? { ...m, role } : m));
  }

  updateSharePermission(index: number, permission: string): void {
    this.shareUsers.update(arr => arr.map((u, i) => i === index ? { ...u, permission } : u));
  }

  updateNotification(index: number, enabled: boolean): void {
    this.notifications.update(arr => arr.map((n, i) => i === index ? { ...n, enabled } : n));
  }
}
