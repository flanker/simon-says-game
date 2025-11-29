import i18n from "@/i18n";
import { Slot } from "expo-router";
import { I18nextProvider } from "react-i18next";

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <Slot />
    </I18nextProvider>
  );
}
