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
      { path: 'reports', element: <ProtectedRoute permissions={['report:view', 'financial:view']}><Lazy><ReportsPage /></Lazy></ProtectedRoute> },
      { path: 'reports/accounting', element: <ProtectedRoute permissions={['financial:view', 'report:view']}><Lazy><AccountingPage /></Lazy></ProtectedRoute> },
      { path: 'reports/accounting/:report', element: <ProtectedRoute permissions={['financial:view', 'report:view']}><Lazy><AccountingPage /></Lazy></ProtectedRoute> },
      { path: 'products', element: <ProtectedRoute permissions={['product:view']}><Lazy><ProductsPage /></Lazy></ProtectedRoute> },
      { path: 'products/:id/analytics', element: <ProtectedRoute permissions={['product:view']}><Lazy><ProductAnalyticsPage /></Lazy></ProtectedRoute> },
      { path: 'items', element: <ProtectedRoute permissions={['items:view']}><Lazy><ItemsPage /></Lazy></ProtectedRoute> },
      { path: 'items/:id', element: <ProtectedRoute permissions={['items:view']}><Lazy><ItemDetailPage /></Lazy></ProtectedRoute> },
      { path: 'brands', element: <ProtectedRoute permissions={['product:view']}><Lazy><BrandsPage /></Lazy></ProtectedRoute> },
      { path: 'categories', element: <ProtectedRoute permissions={['product:view']}><Lazy><CategoriesPage /></Lazy></ProtectedRoute> },
      { path: 'sales', element: <ProtectedRoute permissions={['sale:view']}><Lazy><SalesPage /></Lazy></ProtectedRoute> },
      { path: 'sales/new', element: <ProtectedRoute permissions={['sale:create']}><Lazy><NewSalePage /></Lazy></ProtectedRoute> },
      { path: 'sales/:id', element: <ProtectedRoute permissions={['sale:view']}><Lazy><SaleDetailPage /></Lazy></ProtectedRoute> },
      { path: 'sales/daily', element: <ProtectedRoute permissions={['sale:view']}><Lazy><DailySalesPage /></Lazy></ProtectedRoute> },
      { path: 'purchases', element: <ProtectedRoute permissions={['purchase:view']}><Lazy><PurchasesPage /></Lazy></ProtectedRoute> },
      { path: 'customers', element: <ProtectedRoute permissions={['customer:view']}><Lazy><CustomersPage /></Lazy></ProtectedRoute> },
      { path: 'employees', element: <ProtectedRoute permissions={['employee:view']}><Lazy><EmployeesPage /></Lazy></ProtectedRoute> },
      { path: 'employees/:id', element: <ProtectedRoute permissions={['employee:view']}><Lazy><EmployeeDetailPage /></Lazy></ProtectedRoute> },
      { path: 'payroll', element: <ProtectedRoute requireAll permissions={['payroll:view', 'employee:view_sensitive']}><Lazy><PayrollPage /></Lazy></ProtectedRoute> },
      { path: 'employees/analytics', element: <ProtectedRoute permissions={['employee:view']}><Lazy><EmployeeAnalyticsPage /></Lazy></ProtectedRoute> },
      { path: 'inventory', element: <ProtectedRoute permissions={['inventory:view']}><Lazy><InventoryPage /></Lazy></ProtectedRoute> },
      { path: 'suppliers', element: <ProtectedRoute permissions={['purchase:view']}><Lazy><SuppliersPage /></Lazy></ProtectedRoute> },
      { path: 'locations', element: <ProtectedRoute permissions={['inventory:view']}><Lazy><LocationsPage /></Lazy></ProtectedRoute> },
      { path: 'departments', element: <ProtectedRoute permissions={['employee:view']}><Lazy><DepartmentsPage /></Lazy></ProtectedRoute> },
      { path: 'notes', element: <ProtectedRoute permissions={['product:view']}><Lazy><NotesPage /></Lazy></ProtectedRoute> },
      { path: 'accords', element: <ProtectedRoute permissions={['product:view']}><Lazy><AccordsPage /></Lazy></ProtectedRoute> },
      { path: 'data-tools', element: <ProtectedRoute permissions={['data:export', 'data:import']}><Lazy><DataToolsPage /></Lazy></ProtectedRoute> },
      { path: 'backups', element: <ProtectedRoute permissions={['backup:manage']}><Lazy><BackupsPage /></Lazy></ProtectedRoute> },
      { path: 'settings', element: <ProtectedRoute permissions={['setting:manage']}><Lazy><SettingsPage /></Lazy></ProtectedRoute> }
    ]
  },
  { path: '*', element: <NotFound /> }
])

export default router
