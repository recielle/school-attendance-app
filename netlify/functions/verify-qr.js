const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = event.headers['x-device-api-key'] || event.headers['X-Device-Api-Key'];
  if (apiKey !== 'secretdtototoo') {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid API Key' }) };
  }

  try {
    const { token, action = 'in' } = JSON.parse(event.body);
    if (!token || !token.includes('.')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid QR Format' }) };
    }

    const [studentNumber, qrTimestampStr] = token.split('.');
    const qrTimestamp = parseInt(qrTimestampStr, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);

    // 3-Minute (180 seconds) QR Expiration Check
    if (isNaN(qrTimestamp) || (nowSeconds - qrTimestamp) > 180) {
      return { statusCode: 400, body: JSON.stringify({ error: 'QR Code Expired' }) };
    }

    const { data: student, error } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('student_number', studentNumber.trim())
      .eq('role', 'student')
      .single();

    if (error || !student) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Student not found' }) };
    }

    const studentName = `${student.first_name} ${student.last_name}`;

    // 7:01 AM Philippine Time Cutoff
    const manilaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const hours = manilaTime.getHours();
    const minutes = manilaTime.getMinutes();

    let remark = 'Time Out';
    if (action === 'in') {
      remark = (hours < 7 || (hours === 7 && minutes <= 1)) ? 'On Time' : 'Late';
    }

    await supabase.from('attendance_logs').insert([{
      student_number: studentNumber.trim(),
      student_name: studentName,
      action,
      remark
    }]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'success', studentName, remark })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
