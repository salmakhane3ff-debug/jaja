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

    default:
      return { isValid: false, message: 'Unknown payment gateway' };
  }

  return { isValid: true, message: 'Gateway is properly configured' };
};

// Get available payment gateways (only enabled and properly configured ones)
export const getAvailablePaymentGateways = (settings) => {
  const gateways = ['stripe', 'paypal'];

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
};
