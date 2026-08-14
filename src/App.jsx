import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import { WorkspaceProvider } from './lib/WorkspaceContext'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import OwnerRoute from './components/auth/OwnerRoute'
import RootGate from './components/auth/RootGate'

import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import Landing from './pages/public/Landing'
import SalesPortal from './pages/public/SalesPortal'
import ClientLicensePortal from './pages/public/ClientLicensePortal'

import OwnerDashboard from './pages/owner/OwnerDashboard'
import OwnerAnalytics from './pages/owner/OwnerAnalytics'
import OwnerSettings from './pages/owner/OwnerSettings'

import UserDashboard from './pages/user/UserDashboard'
import UserSettings from './pages/user/UserSettings'
import Projects from './pages/user/Projects'
import Clients from './pages/user/Clients'
import Invoices from './pages/user/Invoices'
import Marketing from './pages/user/Marketing'
import Sales from './pages/user/Sales'
import SEO from './pages/user/SEO'
import WebsiteBuilder from './pages/user/WebsiteBuilder'
import Analytics from './pages/user/Analytics'
import Automation from './pages/user/Automation'

import CompanyBrain from './pages/future/CompanyBrain'
import Finance from './pages/future/Finance'
import CustomerSuccess from './pages/future/CustomerSuccess'
import CEOBrain from './pages/owner/CEOBrain'
import Directors from './pages/owner/Directors'
import DirectorDetail from './pages/owner/DirectorDetail'
import EmployeeOffice from './pages/owner/EmployeeOffice'
import EmployeeDetail from './pages/owner/EmployeeDetail'
import WorkflowEngine from './pages/owner/WorkflowEngine'
import WorkflowDetail from './pages/owner/WorkflowDetail'
import AutomationEngine from './pages/owner/AutomationEngine'
import MemoryEngine from './pages/owner/MemoryEngine'
import IntegrationLayer from './pages/owner/IntegrationLayer'
import WebsiteAI from './pages/owner/WebsiteAI'
import GrowthAI from './pages/owner/GrowthAI'
import EmailCampaigns from './pages/owner/EmailCampaigns'
import LicenseManagement from './pages/owner/LicenseManagement'
import LocalAgentSettings from './pages/owner/LocalAgentSettings'
import VoiceAgentConsole from './pages/owner/VoiceAgentConsole'

import CompanyOffice from './pages/CompanyOffice'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <Routes>
          {/* Real, public landing page + auth redirect gate — replaces
              the old always-protected index route. */}
          <Route path="/" element={<RootGate />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          {/* Phase 15 — the real client-facing Sales AI portal. No auth,
              no AppLayout/sidebar — this is opened by an actual client,
              not a FEXUS user. */}
          <Route path="/talk-to-us/:token" element={<SalesPortal />} />
          {/* Phase 23 — the real client License authentication portal.
              Separate session mechanism from Owner/User login and from
              the Sales Portal above. */}
          <Route path="/client-access" element={<ClientLicensePortal />} />

          {/* Everything below requires a signed-in Company User */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              {/* Real, existing Owner-built pages, reused directly (not
                  duplicated) at a new User-panel path — accessible to
                  any signed-in Company User at both the routing/UI
                  layer AND the real backend (requireOwner was relaxed
                  to requireAuth on these routes, per explicit Owner
                  instruction — Desktop/Local PC Agent control remains
                  the one, deliberate exception, still Owner-only). */}
              <Route path="user/website-ai" element={<WebsiteAI />} />
              <Route path="user/voice-agent" element={<VoiceAgentConsole />} />

              {/* Owner-only */}
              <Route element={<OwnerRoute />}>
                <Route path="owner/dashboard" element={<OwnerDashboard />} />
                <Route path="owner/analytics" element={<OwnerAnalytics />} />
                <Route path="owner/settings" element={<OwnerSettings />} />
                <Route path="company-office" element={<CompanyOffice />} />
                <Route path="company-brain" element={<CompanyBrain />} />
                <Route path="ceo-brain" element={<CEOBrain />} />
                <Route path="directors" element={<Directors />} />
                <Route path="directors/:key" element={<DirectorDetail />} />
                <Route path="employees" element={<EmployeeOffice />} />
                <Route path="employees/:id" element={<EmployeeDetail />} />
                <Route path="workflow-engine" element={<WorkflowEngine />} />
                <Route path="workflow-engine/:id" element={<WorkflowDetail />} />
                <Route path="automation-engine" element={<AutomationEngine />} />
                <Route path="memory-engine" element={<MemoryEngine />} />
                <Route path="integration-layer" element={<IntegrationLayer />} />
                <Route path="website-ai" element={<WebsiteAI />} />
                <Route path="growth-ai" element={<GrowthAI />} />
                <Route path="license-management" element={<LicenseManagement />} />
                <Route path="local-agent" element={<LocalAgentSettings />} />
                <Route path="voice-agent" element={<VoiceAgentConsole />} />
              </Route>

              {/* Any signed-in Company User */}
              <Route path="dashboard" element={<UserDashboard />} />
              <Route path="settings" element={<UserSettings />} />
              {/* Phase 21 — Connected Emails + Email Campaigns are the same
                  real, per-account-isolated system for every authenticated
                  Company User, not just the Owner. */}
              <Route path="email-campaigns" element={<EmailCampaigns />} />
              <Route path="projects" element={<Projects />} />
              <Route path="clients" element={<Clients />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="marketing" element={<Marketing />} />
              <Route path="sales" element={<Sales />} />
              <Route path="seo" element={<SEO />} />
              <Route path="website-builder" element={<WebsiteBuilder />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="automation" element={<Automation />} />

              {/* Future-phase modules — staged, not owner-restricted */}
              <Route path="finance" element={<Finance />} />
              <Route path="customer-success" element={<CustomerSuccess />} />

              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </WorkspaceProvider>
    </AuthProvider>
  )
}
