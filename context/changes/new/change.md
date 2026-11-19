---
change_id: new
title: Investment Diary login page
status: implementing
created: 2026-11-19
updated: 2026-11-19
archived_at: null
---

## Notes

# Prompt: Build a Professional Investment Diary Login Page

Act as a **Senior Frontend Engineer, UI/UX Designer, and Product Design Expert** specializing in premium fintech and investment management applications.

Your task is to design and implement a **modern, elegant, secure, and production-quality login page** for a web application called **Investment Diary**.

The application helps investors track their investments, document trades, analyze portfolio performance, and maintain a disciplined investment journal.

## 1. Design Direction

Create a premium fintech experience inspired by modern financial dashboards, wealth management platforms, and professional investment tools.

The design should communicate:

- Trust, security, and professionalism
- Financial sophistication
- Simplicity and clarity
- Premium SaaS product quality
- Attention to detail

Avoid generic login templates, excessive gradients, unnecessary decorations, and outdated UI patterns.

### Visual Style

- Clean, minimalist, modern interface
- Dark navy, charcoal, and subtle emerald green accents
- Refined typography (Inter or Geist)
- Generous whitespace
- Subtle borders and soft shadows
- Consistent spacing and alignment
- Elegant hover, focus, and transition effects
- Fully responsive layout
- Support light and dark themes if the existing application supports them

## 2. Page Layout

For desktop, implement a polished two-column layout.

### Left Panel — Branding and Product Value

Create a visually engaging branded section containing:

**Application branding**
- Minimalist investment-inspired logo
- Product name: Investment Diary
- Optional tagline: "Invest with clarity. Grow with discipline."

**Hero content**

Headline:
"Every investment tells a story."

Supporting description:
"Track your decisions, understand your performance, and build better investing habits — all in one place."

Include a subtle, visually attractive mock investment dashboard featuring:
- Portfolio balance
- Performance percentage
- Minimal portfolio performance chart
- Sample investment activity
- Small financial insight cards

All dashboard data should be clearly illustrative, not real user data.

Use subtle decorative elements such as:
- Abstract financial chart lines
- Soft radial glow
- Grid pattern
- Elegant geometric details

Keep the composition sophisticated and uncluttered.

### Right Panel — Login Form

Create a centered login form with:

**Heading:** Welcome back

**Description:** Sign in to your Investment Diary account.

Form elements:
1. Email address input
2. Password input
3. Show/hide password control
4. Remember me checkbox (only if supported by the authentication system)
5. Forgot password link
6. Primary "Sign In" button
7. Optional Google sign-in button if supported by the backend
8. "Don't have an account? Create an account" link

Use clear labels, professional input styling, and subtle interactive states.

## 3. User Experience

Implement all essential login interactions:

- Email format validation
- Required-field validation
- Clear inline error messages
- Password visibility toggle
- Loading state during authentication
- Disable duplicate submissions while loading
- Authentication failure feedback
- Keyboard-friendly navigation
- Enter-to-submit behavior
- Proper autofocus and focus management
- Responsive transitions
- Appropriate success redirects
- Preserve any safe, validated return URL after login

Never reveal whether an account exists through unnecessarily specific authentication errors.

## 4. Authentication and Security

Integrate the login form with the application's **existing authentication infrastructure**.

Before implementing:
- Inspect the project structure
- Identify the existing frontend framework
- Identify the routing solution
- Check the authentication provider and API
- Reuse existing components, utilities, and design tokens

Security requirements:
- Never hardcode credentials or secrets
- Never log passwords or authentication tokens
- Do not store sensitive tokens in localStorage
- Prefer secure, HttpOnly, SameSite cookies for session management where supported
- Implement appropriate CSRF protection for cookie-based authentication
- Handle authentication failures safely
- Use HTTPS in production
- Never simulate successful authentication in production
- Ensure protected pages cannot be accessed without valid authorization
- Keep authentication and session validation enforced on the server

If authentication is not yet configured, build a clean integration layer without inventing backend endpoints. Document what is needed to connect the real authentication service.

## 5. Responsive Design

**Desktop (1024px and above)**
- Two-column layout
- Branding panel on the left
- Login form on the right

**Tablet (768px–1023px)**
- Adapt panel proportions
- Simplify decorative content
- Maintain comfortable form dimensions

**Mobile (below 768px)**
- Single-column layout
- Focus on the login form
- Show compact branding above the form
- Hide the decorative dashboard preview
- Full-width inputs and primary button
- Comfortable touch targets
- No horizontal scrolling

## 6. Component Architecture

Use reusable, maintainable components where appropriate:

- LoginPage
- LoginForm
- BrandPanel
- EmailInput
- PasswordInput
- SocialLoginButton
- FormErrorMessage
- InvestmentDashboardPreview

Follow the existing project's architecture and conventions. Avoid unnecessary component abstraction.

Use TypeScript if the project supports it.

## 7. Accessibility

Follow WCAG 2.2 AA principles:

- Semantic HTML
- Proper form labels
- Accessible error descriptions
- Sufficient color contrast
- Visible keyboard focus indicators
- Screen-reader-friendly feedback
- Accessible password visibility controls
- Reduced-motion preference support

## 8. Animation and Polish

Add subtle, tasteful interactions:

- Smooth input focus transitions
- Button hover and pressed states
- Loading spinner during sign-in
- Gentle entrance animation where appropriate
- Password toggle animation
- Subtle chart visualization in the branding panel

Animations should be lightweight and must not distract from the login experience.

## 9. Technical Quality

- Reuse the existing design system
- Avoid unnecessary dependencies
- Write clean, maintainable code
- Keep styling consistent with the application
- Ensure proper error handling
- Avoid hydration and layout-shift issues
- Optimize performance
- Ensure compatibility with modern browsers
- Add relevant tests for form validation, loading states, authentication errors, and navigation

## 10. Acceptance Criteria

The implementation is complete when:

- The page looks like a premium financial SaaS product
- Desktop and mobile layouts are polished
- Login form validation works correctly
- Password visibility works
- Authentication integrates with the existing backend
- Loading and error states are handled correctly
- Authentication security is preserved
- All controls are keyboard-accessible
- The UI matches the application's existing architecture
- There are no unnecessary dependencies or placeholder authentication flows



