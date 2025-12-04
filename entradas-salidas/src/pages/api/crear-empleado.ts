import { NextApiRequest, NextApiResponse } from "next";
import * as admin from "firebase-admin";
import nodemailer from "nodemailer";

console.log("🔧 Iniciando módulo crear-empleado");

// Inicializar Firebase Admin solo una vez
if (!admin.apps.length) {
  console.log(
    "🔥 Firebase Admin no inicializado, procediendo a inicializar..."
  );

  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !process.env.FIREBASE_PRIVATE_KEY
  ) {
    console.error("❌ Faltan variables de entorno:");
    console.error("FIREBASE_PROJECT_ID:", !!process.env.FIREBASE_PROJECT_ID);
    console.error(
      "FIREBASE_CLIENT_EMAIL:",
      !!process.env.FIREBASE_CLIENT_EMAIL
    );
    console.error("FIREBASE_PRIVATE_KEY:", !!process.env.FIREBASE_PRIVATE_KEY);

    throw new Error(
      "Faltan variables de entorno para Firebase Admin SDK. Por favor configura FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY en .env.local"
    );
  }

  const credentialConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };

  console.log("✅ Variables de entorno cargadas correctamente");
  console.log("📧 Client Email:", process.env.FIREBASE_CLIENT_EMAIL);
  console.log("🆔 Project ID:", process.env.FIREBASE_PROJECT_ID);

  admin.initializeApp({
    credential: admin.credential.cert(credentialConfig),
  });

  console.log("✅ Firebase Admin inicializado correctamente");
} else {
  console.log("✅ Firebase Admin ya estaba inicializado");
}

// Configurar Nodemailer
console.log("📧 Configurando Nodemailer...");
console.log("EMAIL_USER:", !!process.env.EMAIL_USER);
console.log("EMAIL_PASS:", !!process.env.EMAIL_PASS);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

console.log("✅ Nodemailer configurado");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log("\n🚀 ===== NUEVA REQUEST =====");
  console.log("📍 Método:", req.method);
  console.log("📍 URL:", req.url);

  // ✅ Agregar headers CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  console.log("✅ Headers CORS configurados");

  // Manejar preflight request
  if (req.method === "OPTIONS") {
    console.log("✅ Preflight OPTIONS request - respondiendo 200");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    console.log("❌ Método no permitido:", req.method);
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    console.log("📦 Body recibido:", JSON.stringify(req.body, null, 2));

    const {
      nombre,
      correo,
      documento,
      rol,
      empresa,
      activo,
      salarioBaseMensual,
    } = req.body;

    console.log("📋 Datos extraídos:");
    console.log("  - nombre:", nombre);
    console.log("  - correo:", correo);
    console.log("  - documento:", documento);
    console.log("  - rol:", rol);
    console.log("  - empresa:", empresa);
    console.log("  - activo:", activo);
    console.log("  - salarioBaseMensual:", salarioBaseMensual);

    if (!nombre || !correo || !salarioBaseMensual || salarioBaseMensual <= 0) {
      console.error("❌ Validación fallida: campos obligatorios faltantes");
      return res
        .status(400)
        .json({ error: "Campos obligatorios faltantes o inválidos" });
    }

    console.log("✅ Validación de campos exitosa");

    // Crear usuario en Firebase Auth
    console.log("🔥 Creando usuario en Firebase Auth...");
    const userRecord = await admin.auth().createUser({
      email: correo,
      emailVerified: false,
      displayName: nombre,
      disabled: !activo,
    });
    console.log("✅ Usuario creado en Auth. UID:", userRecord.uid);

    // Guardar en Firestore
    console.log("💾 Guardando usuario en Firestore...");
    await admin
      .firestore()
      .collection("usuarios")
      .doc(userRecord.uid)
      .set({
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
    console.log("✅ Usuario guardado en Firestore");

    // Enlace para definir contraseña
    console.log("🔗 Generando enlace de reset de contraseña...");
    const resetLink = await admin.auth().generatePasswordResetLink(correo);
    console.log("✅ Enlace generado:", resetLink.substring(0, 50) + "...");

    console.log("📧 Enviando correo...");
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

  <!-- 🔥 TEXTO GRANDE QUE PEDISTE -->
  <h1 style="text-align:center; color:#000; font-size:26px; margin:40px 0; line-height:1.4;">
    🔗 Cuando termines de crear tu contraseña, vuelve al correo e ingresa aquí:<br><br>
    <a href="https://my-web-app--controlpersonal-a5371.us-central1.hosted.app/" 
       style="color:#007bff; text-decoration:none;">
      https://my-web-app--controlpersonal-a5371.us-central1.hosted.app/
    </a>
  </h1>
  <!-- 🔥 FIN TEXTO GRANDE -->

  <p>Si el botón no funciona, copia este enlace:</p>
  <p style="word-break:break-all; color:#666;">${resetLink}</p>

  <hr style="border:none; border-top:1px solid #eee; margin:20px 0;">
  <p style="color:#666; font-size:12px;">Si no solicitaste esta cuenta, ignora este mensaje.</p>
</div>

      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ Correo enviado exitosamente");

    console.log("🎉 Proceso completado exitosamente");
    res.status(200).json({
      success: true,
      uid: userRecord.uid,
      message: "Empleado creado exitosamente y correo enviado.",
    });
  } catch (error: unknown) {
    console.error("\n❌ ===== ERROR EN EL PROCESO =====");
    console.error("Error completo:", error);

    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }

    let message = "Error interno del servidor";

    if (typeof error === "object" && error !== null) {
      const maybeErr = error as Record<string, unknown>;
      const code =
        typeof maybeErr.code === "string" ? maybeErr.code : undefined;

      console.error("Error code:", code);

      if (code === "auth/email-already-exists") {
        message = "El correo ya está registrado";
        console.error("❌ El correo ya existe en Firebase Auth");
      }
      if (code === "auth/invalid-email") {
        message = "Correo inválido";
        console.error("❌ Correo inválido");
      }
    }

    console.error("Mensaje de error para cliente:", message);
    return res.status(500).json({ error: message });
  }
}
