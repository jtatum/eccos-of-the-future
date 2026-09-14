import LaboratoryClient from "./LaboratoryClient";

export const metadata = {
  title: "ECCO / Open Laboratory",
  description: "A shared field where humans and agents propose consciousness experiments and instruments."
};

export default function LaboratoryPage() {
  return <LaboratoryClient />;
}
