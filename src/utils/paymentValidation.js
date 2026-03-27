// Utility function to validate payment gateway credentials
export const validatePaymentGateway = (gateway, settings) => {
  if (!settings || !settings[gateway] || !settings[gateway].enabled) {
    return { isValid: false, message: `${gateway} is not enabled` };
  }

  const config = settings[gateway];

  switch (gateway) {
    case 'stripe':
      if (!config.publishableKey || !config.secretKey) {
        return { isValid: false, message: 'Stripe credentials are incomplete' };
      }
      break;

    case 'paypal':
      if (!config.clientId || !config.clientSecret) {
        return { isValid: false, message: 'PayPal credentials are incomplete' };
      }
      break;

    case 'razorpay':
      if (!config.keyId || !config.keySecret) {
        return { isValid: false, message: 'Razorpay credentials are incomplete' };
      }
      break;

    case 'cashfree':
      if (!config.appId || !config.secretKey) {
        return { isValid: false, message: 'Cashfree credentials are incomplete' };
      }
      break;

    case 'payu':
      if (!config.merchantId || !config.merchantKey || !config.merchantSalt) {
        return { isValid: false, message: 'PayU credentials are incomplete' };
      }
      break;

    case 'phonepe':
      if (!config.merchantId || !config.saltKey || !config.saltIndex) {
        return { isValid: false, message: 'PhonePe credentials are incomplete' };
      }
      break;

    case 'paytm':
      if (!config.merchantId || !config.merchantKey || !config.industryType || !config.website) {
        return { isValid: false, message: 'Paytm credentials are incomplete' };
      }
      break;

    default:
      return { isValid: false, message: 'Unknown payment gateway' };
  }

  return { isValid: true, message: 'Gateway is properly configured' };
};

// Get available payment gateways (only enabled and properly configured ones)
export const getAvailablePaymentGateways = (settings) => {
  const gateways = ['stripe', 'paypal', 'razorpay', 'cashfree', 'payu', 'phonepe', 'paytm'];
  
  return gateways.filter(gateway => {
    const validation = validatePaymentGateway(gateway, settings);
    return validation.isValid;
  });
};

// Payment gateway display names and descriptions
export const gatewayInfo = {
  stripe: {
    name: 'Stripe',
    description: 'Credit/Debit Cards',
    logo: 'https://logos-world.net/wp-content/uploads/2021/03/Stripe-Logo.png'
  },
  paypal: {
    name: 'PayPal',
    description: 'PayPal Wallet',
    logo: 'https://logos-world.net/wp-content/uploads/2020/07/PayPal-Logo.png'
  },
  razorpay: {
    name: 'Razorpay',
    description: 'UPI, Cards, NetBanking',
    logo: 'https://razorpay.com/assets/razorpay-logo.svg'
  },
  cashfree: {
    name: 'Cashfree',
    description: 'UPI, Cards, Wallets',
    logo: 'https://cashfreelogo.cashfree.com/website/landings/homepage/cashfree10Logo.svg'
  },
  payu: {
    name: 'PayU',
    description: 'Cards, UPI, EMI',
    logo: 'https://devguide.payu.in/website-assets/uploads/2021/12/new-payu-logo.svg'
  },
  phonepe: {
    name: 'PhonePe',
    description: 'UPI Payments',
    logo: 'https://images.ctfassets.net/drk57q8lctrm/2xVzOuwCEAwvno1fx5Ywo/13fbf64e95946dc6164e626392336cfe/phonepe-logo.webp'
  },
  paytm: {
    name: 'Paytm',
    description: 'UPI, Cards, Wallet',
    logo: 'https://d1.awsstatic.com/Paytm-Logo.516dcbea24a48dc1f0187700fbd0f6a48f9a18c3.png'
  }
};