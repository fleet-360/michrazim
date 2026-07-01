import mongoose, { Schema, model, models, type InferSchemaType } from "mongoose";
import type { DealInputs } from "@/lib/engine/types";

// --------------------------------------------------------------------------
// Organization & User
// --------------------------------------------------------------------------
const OrganizationSchema = new Schema(
  {
    name: { type: String, required: true },
    logoUrl: String,
  },
  { timestamps: true },
);

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "analyst", "viewer"], default: "analyst" },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization" },
    title: String,
    company: String,
    // tender ids (dc-/pl-/ur-) the user follows
    watchlist: { type: [String], default: [] },
    onboarded: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// --------------------------------------------------------------------------
// City fee schedule (אגרות והיטלי פיתוח)
// --------------------------------------------------------------------------
const CitySchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    region: String,
    lat: Number,
    lng: Number,
    buildingFeePerSqm: Number,
    sewageLevyPerSqm: Number,
    waterLevyPerSqm: Number,
    roadsLevyPerSqm: Number,
    drainageLevyPerSqm: Number,
    openSpaceLevyPerSqm: Number,
    avgResidentialPricePerSqm: Number,
    notes: String,
  },
  { timestamps: true },
);

// --------------------------------------------------------------------------
// Comparable transactions (עסקאות השוואה)
// --------------------------------------------------------------------------
const ComparableSchema = new Schema(
  {
    city: { type: String, index: true },
    neighborhood: String,
    address: String,
    lat: Number,
    lng: Number,
    dealDate: String,
    pricePerSqm: Number,
    totalPrice: Number,
    sizeSqm: Number,
    rooms: Number,
    floor: Number,
    yearBuilt: Number,
    propertyType: String,
    source: { type: String, enum: ["live", "mock"], default: "mock" },
  },
  { timestamps: true },
);

// --------------------------------------------------------------------------
// Tender listings (מכרזי רמ"י)
// --------------------------------------------------------------------------
const TenderListingSchema = new Schema(
  {
    tenderId: String,
    title: String,
    city: String,
    gush: String,
    helka: String,
    lat: Number,
    lng: Number,
    plotAreaSqm: Number,
    units: Number,
    far: Number,
    developmentCost: Number,
    minPrice: Number,
    publishDate: String,
    submissionDeadline: String,
    status: { type: String, enum: ["open", "closed", "awarded"], default: "open" },
    url: String,
    source: { type: String, enum: ["live", "mock"], default: "mock" },
  },
  { timestamps: true },
);

// --------------------------------------------------------------------------
// Project (a deal being underwritten)
// --------------------------------------------------------------------------
const ProjectSchema = new Schema(
  {
    name: { type: String, required: true },
    track: { type: String, enum: ["RMI", "URBAN_RENEWAL", "PRIVATE"], required: true },
    status: {
      type: String,
      enum: ["DRAFT", "ANALYZING", "GO", "CONDITIONAL", "NO_GO"],
      default: "DRAFT",
    },
    city: String,
    gush: String,
    helka: String,
    address: String,
    lat: Number,
    lng: Number,
    plotAreaSqm: Number,
    parcelGeoJson: Schema.Types.Mixed,
    marketAnchor: Number,
    bid: Number,
    riskAppetite: { type: Number, default: 0.4 },
    inputs: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization" },
    coverImage: String,
    // Deal-room: unguessable token granting read-only access to the report.
    shareToken: { type: String, index: true },
  },
  { timestamps: true },
);

const AiInsightSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    kind: { type: String, enum: ["risk", "report", "qa"], required: true },
    prompt: String,
    content: String,
    model: String,
  },
  { timestamps: true },
);

export type ProjectDoc = InferSchemaType<typeof ProjectSchema> & {
  _id: mongoose.Types.ObjectId;
  inputs: DealInputs;
};
export type CityDoc = InferSchemaType<typeof CitySchema> & { _id: mongoose.Types.ObjectId };
export type ComparableDoc = InferSchemaType<typeof ComparableSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type TenderDoc = InferSchemaType<typeof TenderListingSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

export const Organization =
  models.Organization || model("Organization", OrganizationSchema);
export const User = models.User || model("User", UserSchema);
export const City = models.City || model("City", CitySchema);
export const Comparable = models.Comparable || model("Comparable", ComparableSchema);
export const TenderListing =
  models.TenderListing || model("TenderListing", TenderListingSchema);
export const Project = models.Project || model("Project", ProjectSchema);
export const AiInsight = models.AiInsight || model("AiInsight", AiInsightSchema);
