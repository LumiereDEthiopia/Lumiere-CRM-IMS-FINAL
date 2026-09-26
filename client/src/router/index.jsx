/**
 * React Router configuration — Stage 4 with lazy loading
 */
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import HomePage from '../pages/Home.jsx'
import LoginPage from '../pages/Login.jsx'
import AccessDenied from '../pages/AccessDenied.jsx'
import NotFound from '../pages/NotFound.jsx'
import ProtectedRoute from '../components/ProtectedRoute.jsx'
import AdminLayout from '../layouts/AdminLayout.jsx'

const DashboardPage = lazy(() => import('../pages/admin/DashboardPage.jsx'))
const ProductsPage = lazy(() => import('../pages/admin/ProductsPage.jsx'))
const ItemsPage = lazy(() => import('../pages/admin/ItemsPage.jsx'))
const ItemDetailPage = lazy(() => import('../pages/admin/ItemDetailPage.jsx'))
const BrandsPage = lazy(() => import('../pages/admin/BrandsPage.jsx'))
const CategoriesPage = lazy(() => import('../pages/admin/CategoriesPage.jsx'))
const SalesPage = lazy(() => import('../pages/admin/SalesPage.jsx'))
const NewSalePage = lazy(() => import('../pages/admin/NewSalePage.jsx'))
const SaleDetailPage = lazy(() => import('../pages/admin/SaleDetailPage.jsx'))
const DailySalesPage = lazy(() => import('../pages/admin/DailySalesPage.jsx'))
const CustomersPage = lazy(() => import('../pages/admin/CustomersPage.jsx'))
const NotesPage = lazy(() => import('../pages/admin/NotesPage.jsx'))
const AccordsPage = lazy(() => import('../pages/admin/AccordsPage.jsx'))
const SettingsPage = lazy(() => import('../pages/admin/SettingsPage.jsx'))
const EmployeesPage = lazy(() => import('../pages/admin/EmployeesPage.jsx'))
const EmployeeDetailPage = lazy(() => import('../pages/admin/EmployeeDetailPage.jsx'))
const PayrollPage = lazy(() => import('../pages/admin/PayrollPage.jsx'))
const InventoryPage = lazy(() => import('../pages/admin/InventoryPage.jsx'))
const PurchasesPage = lazy(() => import('../pages/admin/PurchasesPage.jsx'))
const LocationsPage = lazy(() => import('../pages/admin/LocationsPage.jsx'))
const DepartmentsPage = lazy(() => import('../pages/admin/DepartmentsPage.jsx'))
const SuppliersPage = lazy(() => import('../pages/admin/SuppliersPage.jsx'))
const BackupsPage = lazy(() => import('../pages/admin/BackupsPage.jsx'))
const ReportsPage = lazy(() => import('../pages/admin/ReportsPage.jsx'))
const AccountingPage = lazy(() => import('../pages/admin/AccountingPage.jsx'))
const EmployeeAnalyticsPage = lazy(() => import('../pages/admin/EmployeeAnalyticsPage.jsx'))
const ProductAnalyticsPage = lazy(() => import('../pages/admin/ProductAnalyticsPage.jsx'))
const DataToolsPage = lazy(() => import('../pages/admin/DataToolsPage.jsx'))

function Lazy({ children }) {
  return (
    <Suspense fallback={<div className="loading-container"><div className="spinner" /><span>Loading...</span></div>}>
      {children}
    </Suspense>
  )
}

function ProtectedAdmin({ children }) {
  return <ProtectedRoute permissions={[]}>{children}</ProtectedRoute>
}

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/access-denied', element: <AccessDenied /> },
  { path: '/dashboard', element: <Navigate to="/admin" replace /> },
  { path: '/reports', element: <Navigate to="/admin/reports" replace /> },
  { path: '/settings', element: <Navigate to="/admin/settings" replace /> },
  { path: '/employees/analytics', element: <Navigate to="/admin/employees/analytics" replace /> },
  {
    path: '/admin',
    element: <ProtectedAdmin><AdminLayout /></ProtectedAdmin>,
    children: [
      { index: true, element: <Lazy><DashboardPage /></Lazy> },
      { path: 'reports', element: <Lazy><ReportsPage /></Lazy> },
      { path: 'reports/accounting', element: <ProtectedRoute permissions={['financial:view', 'report:view']}><Lazy><AccountingPage /></Lazy></ProtectedRoute> },
      { path: 'reports/accounting/:report', element: <ProtectedRoute permissions={['financial:view', 'report:view']}><Lazy><AccountingPage /></Lazy></ProtectedRoute> },
      { path: 'products', element: <Lazy><ProductsPage /></Lazy> },
      { path: 'products/:id/analytics', element: <Lazy><ProductAnalyticsPage /></Lazy> },
      { path: 'items', element: <Lazy><ItemsPage /></Lazy> },
      { path: 'items/:id', element: <Lazy><ItemDetailPage /></Lazy> },
      { path: 'brands', element: <Lazy><BrandsPage /></Lazy> },
      { path: 'categories', element: <Lazy><CategoriesPage /></Lazy> },
      { path: 'sales', element: <Lazy><SalesPage /></Lazy> },
      { path: 'sales/new', element: <Lazy><NewSalePage /></Lazy> },
      { path: 'sales/:id', element: <Lazy><SaleDetailPage /></Lazy> },
      { path: 'sales/daily', element: <Lazy><DailySalesPage /></Lazy> },
      { path: 'purchases', element: <Lazy><PurchasesPage /></Lazy> },
      { path: 'customers', element: <Lazy><CustomersPage /></Lazy> },
      { path: 'employees', element: <ProtectedRoute permissions={['employee:view']}><Lazy><EmployeesPage /></Lazy></ProtectedRoute> },
      { path: 'employees/:id', element: <ProtectedRoute permissions={['employee:view']}><Lazy><EmployeeDetailPage /></Lazy></ProtectedRoute> },
      { path: 'payroll', element: <ProtectedRoute requireAll permissions={['payroll:view', 'employee:view_sensitive']}><Lazy><PayrollPage /></Lazy></ProtectedRoute> },
      { path: 'employees/analytics', element: <ProtectedRoute permissions={['employee:view']}><Lazy><EmployeeAnalyticsPage /></Lazy></ProtectedRoute> },
      { path: 'inventory', element: <Lazy><InventoryPage /></Lazy> },
      { path: 'suppliers', element: <Lazy><SuppliersPage /></Lazy> },
      { path: 'locations', element: <Lazy><LocationsPage /></Lazy> },
      { path: 'departments', element: <Lazy><DepartmentsPage /></Lazy> },
      { path: 'notes', element: <Lazy><NotesPage /></Lazy> },
      { path: 'accords', element: <Lazy><AccordsPage /></Lazy> },
      { path: 'data-tools', element: <Lazy><DataToolsPage /></Lazy> },
      { path: 'backups', element: <Lazy><BackupsPage /></Lazy> },
      { path: 'settings', element: <Lazy><SettingsPage /></Lazy> }
    ]
  },
  { path: '*', element: <NotFound /> }
])

export default router
