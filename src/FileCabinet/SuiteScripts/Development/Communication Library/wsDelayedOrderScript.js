/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(["N/runtime", "N/search", "N/render", "N/email", "N/record"], /**
 * @param{runtime} runtime
 * @param{search} search
 */ (runtime, search, render, email, record) => {
  /**
   * Defines the Scheduled script trigger point.
   * @param {Object} scriptContext
   * @param {string} scriptContext.type - Script execution context. Use values from the scriptContext.InvocationType enum.
   * @since 2015.2
   */
  const execute = (scriptContext) => {
    let orderList = getDelayedOrders();

    for (let i = 0; i < 1 /*orderList.length()*/; i++) {
      let internalId = orderList[i].getValue({
        name: "internalid",
        join: "transaction",
      });
      //trigger email for this order by calling communicationLibrary
      log.debug({ title: "Loop through orders", details: internalId });
      let orderItem = getItems(internalId);

      //Get Order details
      var recSO = record.load({
        type: "salesorder",
        id: internalId,
        isDynamic: false,
      });

      var custEmail = recSO.getValue({
        fieldId: "custbody_customers_email_address",
      });
      log.debug("Email", custEmail);

      const linecount = recSO.getLineCount({ sublistId: "item" });
      log.debug("linecount", linecount);
      var orderDetails = getItems(internalId);

      log.debug({
        title: "Items",
        details: "items: " + JSON.stringify(orderDetails),
      });

      var orderTrackingLink = recSO.getValue({
        fieldId: "custbody_order_tracking_link",
      });
      log.debug({
        title: "Tracking Link",
        details: "Link: " + orderTrackingLink,
      });

      var currentLineDeliveryDate = recSO.getValue({
        fieldId: "custbody_last_updated_delivered_date",
      });
      log.debug({
        title: "DeliveryDate",
        details: "currentLineDeliveryDate: " + currentLineDeliveryDate,
      });

      //Get Email Template
      var mergeResult = render.mergeEmail({
        templateId: 269,
        entity: null,
        recipient: null,
        supportCaseId: null,
        transactionId: null,
        customRecord: null,
      });
      var emailSubject = mergeResult.subject;
      log.debug("Subject", emailSubject);
      var emailBody = mergeResult.body;

      emailBody = emailBody.replace(
        "currentLineDeliveryDate",
        currentLineDeliveryDate
          .toLocaleDateString("en-GB")
          .split("-")
          .reverse()
          .join("/")
      );

      emailBody = emailBody.replace("track_order_link1", orderTrackingLink);
      emailBody = emailBody.replace("track_order_link2", orderTrackingLink);
      var itemString = "";
      orderDetails.map((item) => {
        itemString =
          itemString +
          ` <div><table style=" margin-bottom: 25px; font-size:15px; max-width: 100%; max-width: 500px; width: 500px; margin: auto;"> <tr> <th style="vertical-align:top; width: 20% ; margin-left: 10px; text-align: start; height: auto; "> <!--[if gte MSO 9]> <table width="555"> <tr> <td><![endif]--><table width="100%" style="max-width:100px"> <tr> <td> <img src=${item.itemImage} width="100%" /> </td> </tr> </table><!--[if gte MSO 9]> </td> </tr> </table><![endif]--> </th> <th style="vertical-align:top; width: 7% ; text-align: center; height: auto; "><p style=" margin-top:0; font-size:11.5px ;"> ${item.qty}</p></th> <th style="vertical-align:top; width: 13% ; margin-left: 10px; text-align: center; height: auto; "><p style=" margin-top:0; font-size: 11.5px;">${item.itemCode}</p></th> <th style="vertical-align:top; width: 40% ; margin-left: 10px; text-align: center; height: auto; "><p style=" margin-top:0; font-size: 11.5px;"> ${item.itemDesc}</p></th> <th style="vertical-align:top; width: 20% ; margin-left: 10px; text-align: center; height: auto; "> <p style=" font-size:12px; margin: 0;"> ${item.status}</p> </th> </tr></table> </div> `;
      });

      emailBody = emailBody.replace("itemLine", itemString);
      //log.debug('Email Body', emailBody);

      var senderId = 129;
      try {
        email.send({
          author: senderId,
          recipients: custEmail,
          subject: emailSubject,
          body: emailBody,
          attachments: null,
          relatedRecords: {
            transactionId: internalId,
          },
        });
      } catch (e) {
        log.debug("Send Error", e.error);
      }
    }
  };

  return { execute };

  function getDelayedOrders() {
    var messageSearchObj = search.create({
      type: "message",
      filters: [
        ["subject", "startswith", "Update for Order No."],
        "AND",
        ["transaction.mainline", "is", "T"],
        "AND",
        ["transaction.status", "anyof", "SalesOrd:B", "SalesOrd:D"],
      ],
      columns: [
        search.createColumn({
          name: "internalid",
          join: "transaction",
          label: "SalesOrderInternalId",
        }),
      ],
    });
    return messageSearchObj.run().getRange({ start: 0, end: 1000 });
  }

  function getItems(orderNo) {
    let columns = [
      search.createColumn({ name: "itemid", join: "item" }),
      search.createColumn({ name: "quantity" }),
      search.createColumn({ name: "salesdescription", join: "item" }),
      search.createColumn({ name: "custitem_magento_image", join: "item" }),
      search.createColumn({ name: "custcol_expected_delivered_by_date" }),
    ];

    let itemSearch = search.create({
      type: "salesorder",
      columns: columns,
      filters: [
        ["type", "anyof", "SalesOrd"],
        "AND",
        ["mainline", "is", "F"],
        "AND",
        ["taxline", "is", "F"],
        "AND",
        ["shipping", "is", "F"],
        "AND",
        ["internalidnumber", "equalto", orderNo],
      ],
    });

    let result = [];

    let pageData = itemSearch.runPaged({ pageSize: 1000 });
    pageData.pageRanges.forEach((pageRange) => {
      let page = pageData.fetch({ index: pageRange.index });
      page.data.forEach((item) => {
        var itemStatus = "In Stock";
        var locateDate = item.getValue(columns[4]);
        locateDate = locateDate.toLocaleString().split("-").reverse().join("/");
        if (item.getValue(columns[4]) > Date.now())
          itemStatus = `Pre Order <p style="font-weight: bold; ; font-size:10px; margin: 0;">Due in stock approx. ${item.expectedDate}</p> `;
        // if (item.getValue(columns[4]) > Date.now()) itemStatus = "Pre Order";

        let newResult = {
          itemCode: item.getValue(columns[0]),
          qty: item.getValue(columns[1]),
          itemDesc: item.getValue(columns[2]),
          itemImage: item.getText(columns[3]),
          expectedDate: locateDate,
          status: itemStatus,
        };

        if (newResult.itemImage !== "") {
          newResult.itemImage =
            "https://4430284.app.netsuite.com" +
            newResult.itemImage +
            "&resizeid=-5";
        }
        result.push(newResult);
      });
    });
    //log.debug('result', result);

    return result;
  }
});
