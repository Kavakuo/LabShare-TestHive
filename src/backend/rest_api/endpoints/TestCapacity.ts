import express from 'express';
import { UserRoles } from '../../../lib/userRoles';
import { TestCapacity, UserCommon, UserLabDiag } from '../../lib/database/models';
import { ITestCapacity } from '../../lib/database/schemas/ITestCapacity';
import JsonSchema, { schemas } from '../jsonSchemas/JsonSchema';
import { OPT } from '../config/options';
import utils from '../utils';
import { Optional } from 'lib/optional'
import { getFilterForPublicUsers } from 'backend/lib';
import { Mongoose } from 'mongoose';

/*
 * Unused Interface (only relevant for the old update function)

interface UpdatePayload {
  totalCapacity: number,
  usedCapacity: number,
  positiveRate: Optional<number>,
  sampleBackup: Optional<number>,
  createdAt: string
}
*/


class TestCapacityEndpoint {
  /*
   * old update function
   * It is uncertain if it worked as intended
   * 
  public async update(req: express.Request, resp: express.Response, next: express.NextFunction) {
    const token = utils.getUnverifiedDecodedJWT(req)
    if (token.role !== UserRoles.LAB_DIAG) {
      return utils.badRequest(resp);
    }

    const capacity: UpdatePayload = req.body;
    if (!JsonSchema.validate(capacity, schemas.testCapacity)) {
      return utils.badRequest(resp)
    }

    const capacities = await TestCapacity.find({user: token.sub}).sort({created: -1}).exec()
    const target = new Date(capacity.createdAt)
    target.setHours(0)
    target.setMinutes(0)
    target.setSeconds(0)

    const later = new Date(target)
    later.setDate(target.getDate() + 1)

    const targetList = capacities.filter(i => {
      i.createdAt < later && i.createdAt > target
    })

    let toSave : ITestCapacity
    if (targetList.length == 0) {
      toSave = new TestCapacity({
        ...capacity,
        user: token.sub
      })
    } else {
      toSave = targetList[0]
      toSave.totalCapacity = capacity.totalCapacity
      toSave.usedCapacity = capacity.usedCapacity
      toSave.positiveRate = capacity.positiveRate
      toSave.sampleBackup = capacity.sampleBackup
    }

    toSave.save().then(() => {
      return utils.successResponse(resp);
    }).catch(() => {
      return utils.internalError(resp);
    })
  }
 */

  public async add(req: express.Request, resp: express.Response, next: express.NextFunction) {
    const token = utils.getUnverifiedDecodedJWT(req)
    if (token.role !== UserRoles.LAB_DIAG) {
      return utils.badRequest(resp);
    }
  
    const newEntry: ITestCapacity = req.body;
    if (!JsonSchema.validate(newEntry, schemas.testCapacity)) {
      return utils.badRequest(resp)
    }

    let begin = new Date(newEntry.createdAt);
    begin.setHours(0,0,0,0);
    let end = new Date(begin);
    end.setDate(end.getDate() + 1);

    //Try finding entries from the user in the database that were created within the same day, regardless of time
    const capacity = await TestCapacity
    .find({
        createdAt: {
          $gte: begin,
          $lt: end
        },
        user: token.sub
      })
    .exec()

    if(capacity.length > 0){
      return utils.internalError(resp);

    }
    let toSave : ITestCapacity
    toSave = new TestCapacity({
      ...newEntry,
      user: token.sub
    })

    toSave.save().then(() => {
      return utils.successResponse(resp);
    }).catch(() => {
      return utils.internalError(resp);
    })    
  }

  public async update(req: express.Request, resp: express.Response, next: express.NextFunction) {
    const token = utils.getUnverifiedDecodedJWT(req)
    if (token.role !== UserRoles.LAB_DIAG) {
      return utils.badRequest(resp);
    }

    const entry: ITestCapacity = req.body.data;
    if (!JsonSchema.validate(entry, schemas.testCapacity)) {
      return utils.badRequest(resp);
    }

    let begin = new Date(entry.createdAt);
    begin.setHours(0,0,0,0);
    let end = new Date(begin);
    end.setDate(end.getDate() + 1);

    const capacity = await TestCapacity
    .find({
        createdAt: {
          $gte: begin,
          $lt: end
        },
        user: token.sub,
        _id: {$ne: req.body._id}
      })
    .exec()

    if(capacity.length > 0)
      return utils.badRequest(resp);

    TestCapacity.updateOne({
      _id: req.body._id,
      user: token.sub
    }, {
      ...entry
    }, { timestamps: false }).then(() => {
      return utils.successResponse(resp);
    }).catch(() => {
      return utils.internalError(resp);
    });
    
  }

  public async delete(req: express.Request, resp: express.Response, next: express.NextFunction) {
    const token = utils.getUnverifiedDecodedJWT(req)
    if (token.role !== UserRoles.LAB_DIAG) {
      return utils.badRequest(resp);
    }
  
    TestCapacity.deleteOne({
      _id: req.body._id,
      user: token.sub
    }).then(() => {
      return utils.successResponse(resp);
    }).catch(() => {
      return utils.internalError(resp);
    });
    
  }

  public async get(req: express.Request, resp: express.Response, next: express.NextFunction) {
    const token = utils.getUnverifiedDecodedJWT(req)

    const capacities = await TestCapacity
      .find({user: token.sub})
      .sort({createdAt: -1})
      .select({
        createdAt: 1,
        updatedAt: 1,
        totalCapacity: 1,
        usedCapacity: 1,
        positiveRate: 1,
        sampleBackup: 1,
        _id: 1
      }).lean().exec()
    resp.send({success: true, data: capacities})
  }

  public async query(req: express.Request, resp: express.Response, next: express.NextFunction) {
    const token = utils.getUnverifiedDecodedJWT(req)
    if (token.role != UserRoles.LAB_DIAG) {
      return utils.badRequest(resp)
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filter: any = {createdAt: {$gte: today}}

    if (OPT.STAGING) {
      filter = {
        staging: true
      }
    }

    const entries = (await TestCapacity.find(filter).populate('user', {
      location: 1,
      organization: 1,
      slug: 1,
      contact: 1,
      _id: 0,
      __t: 0
    }, UserLabDiag, getFilterForPublicUsers())
      .select({_id: 0}).lean().exec()).filter(i => i.user != null)

    resp.send({
      success: true,
      data: entries
    })
  }

  public async getTestCapacity(req: express.Request, resp: express.Response, next: express.NextFunction) {

    let page = 0
    try {
        if (typeof req.query.page !== "string") throw new Error()
        page = parseInt(req.query.page ?? '1') - 1
    }
    catch {
        page = 0
    }
    page = Math.max(page, 0)


    const token = utils.getUnverifiedDecodedJWT(req)

    let count = await TestCapacity
    .find({user: token.sub}).lean().countDocuments().exec()

    let filters = {
      createdAt: 1,          //include creation date
      totalCapacity: 1,      //include "Capacity"
      usedCapacity: 1,       //include "Tests"
      positiveRate: 1,       //include "Positive Rate"
      sampleBackup: 1,       //include "Backlog"
      _id: 1                 //include id
    }

    const capacities = await TestCapacity
    .find({user: token.sub}) //Filter user
    .sort({createdAt: -1})   //Sort by date, newest first.
    .select(filters) //Filter
    .lean() //Returns plain JavaScript object instead of MongooseDocuments 
    .skip(20 * page).limit(20) //Pagination
    .exec() //Execute all that above

    resp.send({success: true, data: capacities, totalResults: count})
  }

  public async getResources(req: express.Request, resp: express.Response, next: express.NextFunction) {

    const token = utils.getUnverifiedDecodedJWT(req)

    let filters = {
      lookingFor: 1,
      offers: 1,
      role: 1,
      details: 1,
      _id: 1                 
    }
    const capacities = await UserCommon
    .find({_id: token.sub}) //Filter user
    .select(filters) //Filter
    .lean() //Returns plain JavaScript object instead of MongooseDocuments 
    .exec() //Execute all that above

    resp.send({success: true, data: capacities})
  }


  public async getTotalData(req: express.Request, resp: express.Response, next: express.NextFunction) {
    const weekago = new Date(); 
    weekago.setHours(0,0,0,0);
    weekago.setDate(weekago.getDate() - 6);

    const capacities = await TestCapacity
    .find({createdAt: {
      $gte: weekago
    }}) 
    .select({usedCapacity: 1, createdAt: 1}) //Filter everything out but the role of the user
    .lean() //Returns plain JavaScript object instead of MongooseDocuments 
    .exec() //Execute all that above

    var testAmount = 0;//The total amount of tests (usedCapacities)
    for(let i = 0; i < capacities.length; i++){
        testAmount += Math.floor(capacities[i].usedCapacity); //Just in case the value is a decimal number
    }

    const users = await UserCommon
    .find() 
    .select({role: 1}) //Filter everything out but the role of the user
    .lean() //Returns plain JavaScript object instead of MongooseDocuments 
    .exec() //Execute all that above
    
    var volunteers = 0;       //total amount of qualified volunteers
    var researchLabs = 0;     //total amount of research laboratories
    var diagnosticLabs = 0;   //total amount of diagnostic laboratories
    var suppliers = 0;        //total amount of suppliers (irrelevant for TotalDataOverview)

    //Increment the amount of the corresponding role
    for(let i = 0; i < users.length; i++){
      switch(users[i].role){
        case UserRoles.LAB_DIAG:
          diagnosticLabs++;
          break;
        case UserRoles.LAB_RESEARCH:
          researchLabs++;
          break;
        case UserRoles.VOLUNTEER:
          volunteers++;
          break;
        case UserRoles.SUPPLIER:
          suppliers++;
          break;
        default:
          break;
      }
    }

    //Data to be returned
    const results = {
      totalTests: testAmount,
      volunteers: volunteers,
      researchLabs: researchLabs,
      diagnosticLabs: diagnosticLabs,
      suppliers: suppliers,
    }

    resp.send({success: true, data: results})
  }

}



export default new TestCapacityEndpoint();