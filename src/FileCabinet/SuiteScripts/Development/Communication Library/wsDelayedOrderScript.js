/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/runtime', 'N/search', 'N/render', 'N/email', 'N/record'],
    /**
 * @param{runtime} runtime
 * @param{search} search
 */
    (runtime, search, render, email, record) => {

        /**
         * Defines the Scheduled script trigger point.
         * @param {Object} scriptContext
         * @param {string} scriptContext.type - Script execution context. Use values from the scriptContext.InvocationType enum.
         * @since 2015.2
         */
        const execute = (scriptContext) => {
            let orderList = getDelayedOrders();

            for (let i=0; i< 1 /*orderList.length()*/; i++){
               let internalId = orderList[i].getValue({name: "internalid",join: "transaction"});
                //trigger email for this order by calling communicationLibrary
                log.debug({title: 'Loop through orders', details: internalId});
                let orderItem = getItems(internalId);

                //Get Order details
                var recSO = record.load({
                    type: 'salesorder',
                    id: internalId,
                    isDynamic: false
                });

                var custEmail = recSO.getValue({
                    fieldId: 'custbody_customers_email_address'
                });
                log.debug('Email', custEmail);

                const linecount = recSO.getLineCount({sublistId: 'item'});
                log.debug('linecount', linecount);
                var orderDetails = getItems(internalId);

                log.debug({title: 'Items', details: 'items: ' + JSON.stringify(orderDetails)})

                var orderTrackingLink = recSO.getValue({
                    fieldId: 'custbody_order_tracking_link'
                })
                log.debug({title: 'Tracking Link', details: 'Link: ' + orderTrackingLink})

                var currentLineDeliveryDate = recSO.getValue({
                    fieldId: 'custbody_last_updated_delivered_date'
                })
                log.debug({title: 'DeliveryDate', details: 'currentLineDeliveryDate: ' + currentLineDeliveryDate})

                //Get Email Template
                var mergeResult = render.mergeEmail({
                    templateId: 269,
                    entity: null,
                    recipient: null,
                    supportCaseId: null,
                    transactionId: null,
                    customRecord: null
                });
                var emailSubject = mergeResult.subject;
                log.debug('Subject', emailSubject);
                var emailBody = mergeResult.body;

                emailBody = emailBody.replace("currentLineDeliveryDate", currentLineDeliveryDate.toLocaleDateString('en-GB').split("-").reverse().join("/"));
                emailBody = emailBody.replace("track_order_link", orderTrackingLink );
                var itemString = "";
                orderDetails.map(item => {
                    itemString=itemString+  `  <div> <div style="display: flex; margin-bottom: 25px; font-size:15px;"> <div style="margin-left: 10px; line-height: 1.2; text-align: start; flex: 100%;"> <div>${item.itemDesc}</div> <div style="font-weight: bold; padding-top: 10px; font-size:12px;">Quantity: ${item.qty}</div> <div> <img src= ${item.itemImage}/></div> </div> </div> <table border="0" cellpadding="0" cellspacing="0" class="divider" role="presentation" style=" table-layout: fixed; vertical-align: top; border-spacing: 0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; min-width: 100%; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; " valign="top" width="100%"> <tbody> <tr style="vertical-align: top" valign="top"> <td class="divider_inner" style=" word-break: break-word; vertical-align: top; min-width: 100%; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; padding-top: 10px; padding-right: 10px; padding-bottom: 10px; padding-left: 10px; " valign="top"> <table align="center" border="0" cellpadding="0" cellspacing="0" class="divider_content" height="1" role="presentation" style=" table-layout: fixed; vertical-align: top; border-spacing: 0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-top: 2px solid #F5F5F5; height: 1px; width: 95%; " valign="top" width="95%"> <tbody> <tr style="vertical-align: top" valign="top"> <td height="1" style=" word-break: break-word; vertical-align: top; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; " valign="top">&nbsp;</td> </tr> </tbody> </table> </td> </tr> </tbody> </table> </div>    `;
                });
                emailBody = emailBody.replace("test_string", itemString);
                //log.debug('Email Body', emailBody);

                var senderId = 129;
                try{
                    email.send({
                        author: senderId,
                        recipients: custEmail,
                        subject: emailSubject,
                        body: emailBody,
                        attachments: null,
                        relatedRecords: {
                            transactionId: internalId
                        }
                    });
                }
                catch (e) {
                    log.debug('Send Error', e.error);
                }
            }
        }

        return {execute}

        function getDelayedOrders(){
            var messageSearchObj = search.create({
                type: "message",
                filters:
                    [
                        ["subject","startswith","Update for Order No."],
                        "AND",
                        ["transaction.mainline","is","T"],
                        "AND",
                        ["transaction.status","anyof","SalesOrd:B","SalesOrd:D"],
                        "AND",
                        ["transaction.internalidnumber","equalto","10826087"]
                    ],
                columns:
                    [
                        search.createColumn({
                            name: "internalid",
                            join: "transaction",
                            label: "SalesOrderInternalId"
                        })
                    ]
            });
            return messageSearchObj.run().getRange({start: 0,end: 1000});
        }

        function getItems(orderNo) {
            let columns = [
                search.createColumn({ name: 'itemid', join: 'item' }),
                search.createColumn({ name: 'quantity' }),
                search.createColumn({ name: 'salesdescription', join: 'item' }),
                search.createColumn({ name: 'custitem_magento_image', join: 'item' })
            ];

            let itemSearch = search.create({
                type: 'salesorder',
                columns: columns,
                filters: [
                    ['type', 'anyof', 'SalesOrd'],
                    'AND',
                    ['mainline', 'is', 'F'],
                    'AND',
                    ['taxline', 'is', 'F'],
                    'AND',
                    ['shipping', 'is', 'F'],
                    "AND",
                    ["internalidnumber","equalto",orderNo]
                ],
            });

            let result = [];

            let pageData = itemSearch.runPaged({ pageSize: 1000 });
            pageData.pageRanges.forEach((pageRange) => {
                let page = pageData.fetch({ index: pageRange.index });
                page.data.forEach((item) => {
                    let newResult = {
                        itemCode: item.getValue(columns[0]),
                        qty: item.getValue(columns[1]),
                        itemDesc: item.getValue(columns[2]),
                        itemImage: item.getText(columns[3]),
                    };

                    if (newResult.itemImage !== '') {
                        newResult.itemImage = 'https://4430284.app.netsuite.com' + newResult.itemImage + '&resizeid=-5';
                    }
                    result.push(newResult);
                });
            });
            //log.debug('result', result);

            return result;
        }
    });
