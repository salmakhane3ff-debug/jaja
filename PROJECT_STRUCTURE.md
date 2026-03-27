# Project Structure

This project is an ecommerce + affiliate + landing page platform.

## Main Structure

project/

backend/
controllers/
productController.js
feedbackController.js
affiliateController.js
orderController.js
checkoutController.js

services/
trackingService.js
paymentService.js
deliveryService.js
affiliateService.js

models/
User.js
Product.js
Feedback.js
Order.js
Affiliate.js
LandingPage.js

routes/
products.js
feedback.js
orders.js
affiliate.js
admin.js

middleware/
auth.js
affiliateTracking.js
adminAuth.js

server.js

frontend/
pages/
index.js
product/
feedback/
checkout/
affiliate/

components/
feedback/
product/
sliders/
buttons/

layouts/

admin/
dashboard/
products/
orders/
feedback/
affiliate/
landing-pages/

database/
schema.prisma
migrations/

tracking/
clickTracker.js
campaignTracker.js
analytics.js
