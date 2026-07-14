const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const { recipients, staffName, timeOut, timeIn, date, gearDetails, comments } = JSON.parse(event.body);
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, '') }
    });
    const html = `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#1e40af">📻 RT Tracker — Return with Comments</h2>
        <p style="color:#64748b;font-size:14px">A return was submitted that requires attention.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <table style="font-size:14px;border-collapse:collapse;width:100%">
          <tr><td style="color:#64748b;padding:5px 0;width:120px">Staff</td><td style="font-weight:600;padding:5px 0">${staffName}</td></tr>
          <tr><td style="color:#64748b;padding:5px 0">Date</td><td style="padding:5px 0">${date}</td></tr>
          <tr><td style="color:#64748b;padding:5px 0">Time Out</td><td style="padding:5px 0">${timeOut}</td></tr>
          <tr><td style="color:#64748b;padding:5px 0">Time In</td><td style="padding:5px 0">${timeIn}</td></tr>
          <tr><td style="color:#64748b;padding:5px 0;vertical-align:top">Gear</td><td style="padding:5px 0">${gearDetails.join('<br>')}</td></tr>
        </table>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-top:16px">
          <p style="margin:0;font-size:13px;color:#991b1b"><strong>💬 Comments:</strong> ${comments}</p>
        </div>
        <p style="color:#94a3b8;font-size:11px;margin-top:24px">Sent automatically by RT Tracker</p>
      </div>`;
    await transporter.sendMail({
      from: `RT Tracker <${process.env.GMAIL_USER}>`,
      to: recipients.join(', '),
      subject: `⚠️ RT Tracker — ${staffName} return with comments`,
      html
    });
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('Email error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};