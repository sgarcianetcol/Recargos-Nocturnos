import { NextApiRequest, NextApiResponse } from "next";

import * as admin from "firebase-admin";
import nodemailer from "nodemailer";

// Inicializar Firebase Admin solo una vez

if (!admin.apps.length) {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error("Faltan variables de entorno para Firebase Admin SDK. Por favor configura FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY en .env.local");
  }

  const credentialConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };

  admin.initializeApp({
    credential: admin.credential.cert(credentialConfig),
  });
}

// Configurar Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { nombre, correo, documento, rol, empresa, activo, salarioBaseMensual } =
      req.body;

    if (!nombre || !correo || !salarioBaseMensual || salarioBaseMensual <= 0) {
      return res
        .status(400)
        .json({ error: "Campos obligatorios faltantes o inválidos" });
    }

    // Crear usuario en Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: correo,
      emailVerified: false,
      displayName: nombre,
      disabled: !activo,
    });

    // Guardar en Firestore
    await admin.firestore().collection("usuarios").doc(userRecord.uid).set({
      id: userRecord.uid,
      nombre,
      correo,
      documento: documento || "",
      rol: rol || "empleado",
      empresa: empresa || "NETCOL",
      activo: activo !== false,
      salarioBaseMensual: Number(salarioBaseMensual),
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Enlace para definir contraseña
    const resetLink = await admin.auth().generatePasswordResetLink(correo);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: correo,
      subject: "Bienvenido a NETCOL - Define tu contraseña",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">¡Bienvenido a NETCOL, ${nombre}!</h2>
          <p>Tu cuenta ha sido creada exitosamente. Para continuar, define tu contraseña aquí:</p>

          <p style="text-align:center; margin:30px 0;">
            <a href="${resetLink}" 
              style="background:#007bff; color:white; padding:12px 24px; text-decoration:none; border-radius:5px;">
              Definir Contraseña
            </a>
          </p>

          <p>Si el botón no funciona, copia este enlace:</p>
          <p style="word-break:break-all; color:#666;">${resetLink}</p>

          <hr style="border:none; border-top:1px solid #eee; margin:20px 0;">
          <p style="color:#666; font-size:12px;">Si no solicitaste esta cuenta, ignora este mensaje.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      uid: userRecord.uid,
      message: "Empleado creado exitosamente y correo enviado.",
    });
  } catch (error: any) {
    console.error("Error creando empleado:", error);

    let message = "Error interno del servidor";
    if (error.code === "auth/email-already-exists") message = "El correo ya está registrado";
    if (error.code === "auth/invalid-email") message = "Correo inválido";

    res.status(500).json({ error: message });
  }
}
