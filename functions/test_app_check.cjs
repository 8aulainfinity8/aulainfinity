"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var admin = __toESM(require("firebase-admin"), 1);
var import_firestore = require("firebase-admin/firestore");
if (!admin.apps.length) {
  admin.initializeApp();
}
const FIRESTORE_DATABASE_ID = "ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca";
const db1 = (0, import_firestore.getFirestore)(FIRESTORE_DATABASE_ID);
console.log("db1 collection:", typeof db1.collection);
const db2 = (0, import_firestore.getFirestore)(admin.apps[0], FIRESTORE_DATABASE_ID);
console.log("db2 collection:", typeof db2.collection);
