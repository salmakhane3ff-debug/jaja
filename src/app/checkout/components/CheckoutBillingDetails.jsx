"use client";
import React, { useState, useEffect } from "react";
import { Input, Select, SelectItem } from "@heroui/react";
import { useLanguage } from "@/context/LanguageContext";

export default function CheckoutBillingDetails({ billingDetails, setBillingDetails, errors }) {
  const { t } = useLanguage();

  // Safety check for billingDetails
  if (!billingDetails || !billingDetails.customer || !billingDetails.address) {
    return (
      <div className="p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-center text-gray-600">{t("checkout_loading")}</p>
      </div>
    );
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const [group, field] = name.split(".");

    // Handle mobile number validation (max 10 digits)
    if (field === 'phone' && value.replace(/\D/g, '').length > 10) {
      return;
    }

    // Handle zipcode validation (max 5 digits for Morocco)
    if (field === 'zip') {
      if (value.replace(/\D/g, '').length > 5) return;
    }

    setBillingDetails((prev) => ({
      ...prev,
      [group]: {
        ...prev[group],
        [field]: value,
      },
    }));
  };

  return (
    <div className="w-full md:w-3/5">
      <h2 className="text-sm md:text-xl font-semibold mb-4">{t("checkout_shipping_address")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label={`${t("checkout_full_name")} *`}
          name="customer.fullName"
          value={billingDetails.customer.fullName}
          onChange={handleInputChange}
          placeholder={t("checkout_full_name")}
          labelPlacement="outside"
          size="sm"
          isRequired
          isInvalid={errors.fullNameError}
          errorMessage={errors.fullNameError ? t("checkout_full_name_required") : ""}
        />

        <Input
          label={`${t("checkout_phone")} *`}
          name="customer.phone"
          value={billingDetails.customer.phone}
          onChange={handleInputChange}
          placeholder="06XXXXXXXX"
          labelPlacement="outside"
          size="sm"
          type="tel"
          isRequired
          maxLength={10}
          pattern="[0-9]*"
          isInvalid={errors.phoneError}
          errorMessage={errors.phoneError ? t("checkout_phone_required") : ""}
        />

        <Input
          label={`${t("checkout_address")} *`}
          name="address.address1"
          value={billingDetails.address.address1}
          onChange={handleInputChange}
          placeholder={t("checkout_address")}
          labelPlacement="outside"
          size="sm"
          isRequired
          isInvalid={errors.address1Error}
          errorMessage={errors.address1Error ? t("checkout_address_required") : ""}
          className="md:col-span-2"
        />

        <Input
          label={t("checkout_address_2")}
          name="address.address2"
          value={billingDetails.address.address2}
          onChange={handleInputChange}
          placeholder={t("checkout_address_2_optional")}
          labelPlacement="outside"
          size="sm"
          className="md:col-span-2"
        />

        <Input
          label={`${t("checkout_city")} *`}
          name="address.city"
          value={billingDetails.address.city}
          onChange={handleInputChange}
          placeholder={t("checkout_city")}
          labelPlacement="outside"
          size="sm"
          isRequired
          isInvalid={errors.cityError}
          errorMessage={errors.cityError ? t("checkout_city_required") : ""}
        />

        <Input
          label={`${t("checkout_zip")} *`}
          name="address.zip"
          value={billingDetails.address.zip}
          onChange={handleInputChange}
          placeholder="XXXXX"
          labelPlacement="outside"
          size="sm"
          type="tel"
          isRequired
          maxLength={5}
          pattern="[0-9]*"
          isInvalid={errors.zipError}
          errorMessage={errors.zipError ? t("checkout_zip_required") : ""}
        />
      </div>
    </div>
  );
}
