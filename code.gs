
var CHANNEL_ACCESS_TOKEN = "/yqB3B4fbdyQqubd62NGbf4Nxlnk8LwYbjkWikrERavqxz3LukxhXfY1roMOM44csYE63ztWa3PrDsaq4o+cDGNR6WjuO7oaf2yMIH3BJW/iZWzzqdGgvc/qN4bmmpmgqaNoUZl6Q6wZzyT60JZUnwdB04t89/1O/w1cDnyilFU=";

// 👉 ใส่ Channel Access Token ของคุณที่นี่
var CHANNEL_ACCESS_TOKEN = "ใส่ChannelAccessTokenของคุณ";

// URL ของ Web App นี้ (หลังจาก Deploy)
// ใช้สำหรับ Logging และ Debugging
var WEB_APP_URL = ScriptApp.getService().getUrl();

/**
 * ฟังก์ชันนี้จะทำงานเมื่อมีการเรียก Web App ผ่านเมธอด GET
 * ใช้สำหรับตรวจสอบว่า Web App ทำงานอยู่หรือไม่
 */
function doGet(e) {
  return ContentService.createTextOutput("Web App พร้อมใช้งานแล้ว ✅ URL: " + WEB_APP_URL);
}

/**
 * ฟังก์ชันนี้จะทำงานเมื่อมีการส่งข้อมูลมายัง Web App ผ่านเมธอด POST
 * ซึ่งในที่นี้คือข้อมูลการจองคิวจาก LIFF App
 */
function doPost(e) {
  try {
    // ตรวจสอบว่ามีข้อมูลส่งมาหรือไม่
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Error: ไม่มีข้อมูล POST");
    }

    // แปลงข้อมูล JSON ที่ส่งมาจาก LIFF App
    var data = JSON.parse(e.postData.contents);
    var userId = data.userId;
    var patientName = data.patientName;
    var doctor = data.doctor;
    var date = data.date;
    var time = data.time;

    // ตรวจสอบข้อมูลพื้นฐาน
    if (!userId || !patientName || !doctor || !date || !time) {
        throw new Error("ข้อมูลไม่ครบถ้วน");
    }

    // เปิด Google Sheet ที่ชื่อ "Queue"
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName("Queue");
    if (!sheet) {
      sheet = spreadsheet.insertSheet("Queue");
      // เพิ่มหัวตารางถ้าเป็นชีตใหม่
      sheet.appendRow(["Queue No.", "Patient Name", "Doctor", "Date", "Time", "Timestamp"]);
    }

    // หาหมายเลขคิวล่าสุด (นับจากแถวสุดท้าย)
    var queueNo = sheet.getLastRow(); // ไม่ +1 เพราะแถวแรกเป็นหัวข้อ

    // เพิ่มข้อมูลการจองใหม่ลงในแถวถัดไป
    sheet.appendRow([queueNo, patientName, doctor, date, time, new Date()]);

    // --- สร้างบัตรคิวในรูปแบบ PDF ---

    // 1. สร้าง Google Doc ชั่วคราวเพื่อเป็นต้นแบบ
    var doc = DocumentApp.create("QueueTicket-" + queueNo);
    var body = doc.getBody();
    body.setAttributes({
        [DocumentApp.Attribute.FONT_FAMILY]: 'Roboto', // ใช้ฟอนต์ที่รองรับภาษาไทยได้ดี
    });

    body.appendParagraph("🏥 คลินิกตัวอย่าง").setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    body.appendParagraph("——————————————").setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    body.appendParagraph("คิวที่ #" + queueNo).setAlignment(DocumentApp.HorizontalAlignment.CENTER).setFontSize(24).setBold(true);
    body.appendParagraph("ผู้จอง: " + patientName).setFontSize(12);
    body.appendParagraph("แพทย์: " + doctor).setFontSize(12);
    body.appendParagraph("วันที่: " + date + " เวลา: " + time).setFontSize(12);
    body.appendParagraph("\n⚠ กรุณาแสดงบัตรนี้ที่เคาน์เตอร์").setAlignment(DocumentApp.HorizontalAlignment.CENTER).setBold(true);
    doc.saveAndClose(); // บันทึกและปิดเอกสาร

    // 2. แปลง Google Doc เป็นไฟล์ PDF
    var docFile = DriveApp.getFileById(doc.getId());
    var pdfBlob = docFile.getAs("application/pdf");

    // 3. สร้างไฟล์ PDF ใน Google Drive และทำให้เป็นสาธารณะ
    var pdfFile = DriveApp.createFile(pdfBlob).setName("QueueTicket-" + queueNo + ".pdf");
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var pdfUrl = pdfFile.getUrl();

    // 4. ลบไฟล์ Google Doc ชั่วคราวทิ้งไป
    DriveApp.getFileById(doc.getId()).setTrashed(true);

    // --- ส่งข้อความยืนยันกลับไปหาผู้ใช้ผ่าน LINE ---
    var message = "✅ จองคิวสำเร็จ!\n\n" +
                  "คิวของคุณคือ: #" + queueNo + "\n" +
                  "ชื่อ: " + patientName + "\n" +
                  "แพทย์: " + doctor + "\n" +
                  "วันที่: " + date + " เวลา: " + time + "\n\n" +
                  "🔗 ดาวน์โหลดบัตรคิว:\n" + pdfUrl;

    sendLineMsg(userId, message);

    // ส่งสถานะ "OK" กลับไปให้ LIFF App
    return ContentService.createTextOutput(JSON.stringify({ status: "OK", queueNo: queueNo }));

  } catch (err) {
    // หากเกิดข้อผิดพลาด ให้บันทึก Log และส่งข้อความแจ้งเตือน
    Logger.log("Error in doPost: " + err.toString());
    Logger.log("Request Data: " + (e ? e.postData.contents : "N/A"));
    // อาจจะส่ง LINE แจ้งผู้ใช้ว่าเกิดข้อผิดพลาดก็ได้ (ถ้ามี userId)
    if (e && e.postData && e.postData.contents) {
        var errorData = JSON.parse(e.postData.contents);
        if (errorData.userId) {
            sendLineMsg(errorData.userId, "❌ ขออภัย เกิดข้อผิดพลาดในการจองคิว กรุณาลองใหม่อีกครั้ง หรือติดต่อเจ้าหน้าที่");
        }
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }));
  }
}

/**
 * ฟังก์ชันสำหรับส่ง Push Message ผ่าน LINE Messaging API
 * @param {string} userId - ไอดีของผู้ใช้ LINE
 * @param {string} msg - ข้อความที่ต้องการส่ง
 */
function sendLineMsg(userId, msg) {
  var url = "https://api.line.me/v2/bot/message/push";
  var payload = {
    "to": userId,
    "messages": [{ "type": "text", "text": msg }]
  };
  var params = {
    "method": "post",
    "contentType": "application/json",
    "headers": { "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true // ป้องกันไม่ให้สคริปต์หยุดทำงานหาก API ยิงไม่สำเร็จ
  };
  UrlFetchApp.fetch(url, params);
}


/////////////////////////
// ฟังก์ชันทดสอบใน Editor
/////////////////////////
function testDoGet() {
  Logger.log(doGet({}).getContent());
}

function testDoPost() {
  var e = {
    postData: {
      contents: JSON.stringify({
        userId: "Uxxxxxxxxxxxx", // 👈 ใส่ User ID ของคุณเพื่อทดสอบ
        patientName: "สมชาย ใจดี",
        doctor: "แพทย์หญิงสมหญิง",
        date: "2025-08-25",
        time: "10:00"
      })
    }
  };
  Logger.log(doPost(e).getContent());
}



