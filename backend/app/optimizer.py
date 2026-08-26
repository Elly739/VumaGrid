import pulp


class EnergyOrchestrator:
    @staticmethod
    def optimize_dispatch(solar_kw: float, load_kw: float, soc_pct: float, grid_online: bool, tariff_kes: float) -> dict:
        """
        Solves a Linear Programming optimization matrix to find the cheapest
        combination of power sources to run the building at this exact second.
        """
        # 1. Initialize the Optimization Problem to MINIMIZE overall costs
        prob = pulp.LpProblem("VumaGrid_Cost_Minimization", pulp.LpMinimize)

        # 2. Define Decision Variables (How much power to draw from each source)
        p_grid = pulp.LpVariable("Power_From_Grid", lowBound=0)
        p_battery_discharge = pulp.LpVariable("Power_From_Battery_Discharge", lowBound=0)
        p_battery_charge = pulp.LpVariable("Power_To_Charge_Battery", lowBound=0)
        p_solar_used = pulp.LpVariable("Solar_Power_Used", lowBound=0)
        p_diesel = pulp.LpVariable("Power_From_Diesel_Gen", lowBound=0)

        # 3. Define the Objective Function (Cost Equation to Minimize)
        diesel_cost_per_kwh = 45.00
        battery_wear_cost = 0.50

        prob += (p_grid * tariff_kes) + (p_diesel * diesel_cost_per_kwh) + (p_battery_discharge * battery_wear_cost)

        # 4. Define System Engineering Constraints
        prob += p_solar_used + p_grid + p_battery_discharge + p_diesel == load_kw + p_battery_charge
        prob += p_solar_used <= solar_kw

        if not grid_online:
            prob += p_grid == 0
        else:
            prob += p_diesel == 0

        if soc_pct <= 20.0:
            prob += p_battery_discharge == 0
        else:
            prob += p_battery_discharge <= 100.0

        if soc_pct >= 95.0:
            prob += p_battery_charge == 0
        else:
            if grid_online and tariff_kes <= 12.00:
                prob += p_battery_charge <= 50.0
            else:
                prob += p_battery_charge <= max(0.0, solar_kw - 0.0)

        # 5. Solve the Linear Programming Optimization Problem
        prob.solve(pulp.PULP_CBC_CMD(msg=False))

        status = pulp.LpStatus[prob.status]

        if status != "Optimal":
            return {"action": "MAINTAIN_GRID_FALLBACK", "dispatch_log": {}}

        grid_val = pulp.value(p_grid)
        bat_dis_val = pulp.value(p_battery_discharge)
        bat_chg_val = pulp.value(p_battery_charge)
        diesel_val = pulp.value(p_diesel)

        if diesel_val > 0:
            primary_command = "ISLAND_EMERGENCY_DIESEL"
        elif bat_dis_val > 0:
            primary_command = "PEAK_SHAVE_BATTERY_DISCHARGE"
        elif bat_chg_val > 0:
            primary_command = "DYNAMIC_TOU_GRID_CHARGE"
        else:
            primary_command = "OPTIMAL_GRID_SOLAR_BALANCE"

        return {
            "status": status,
            "primary_command": primary_command,
            "dispatch_log": {
                "grid_draw_kw": round(grid_val, 1),
                "battery_discharge_kw": round(bat_dis_val, 1),
                "battery_charge_kw": round(bat_chg_val, 1),
                "diesel_draw_kw": round(diesel_val, 1),
                "solar_utilized_kw": round(pulp.value(p_solar_used), 1),
            },
        }

    @staticmethod
    def simulate_investment_roi(historical_logs: list, current_bess_kwh: float, upgraded_bess_kwh: float, battery_cost_kes: float) -> dict:
        """
        Simulates a full 24-hour cycle using the upgraded battery parameters
        to calculate absolute financial savings and payback metrics.
        """
        total_cost_current = 0.0
        total_cost_upgraded = 0.0

        for log in historical_logs:
            solar = log["solar_generation_kw"]
            load = log["facility_load_kw"]
            tariff = log["current_tariff_kes"]
            grid_online = log["grid_online"]

            res_current = EnergyOrchestrator.optimize_dispatch(solar, load, 50.0, grid_online, tariff)
            if res_current["status"] == "Optimal":
                log_data = res_current["dispatch_log"]
                total_cost_current += (log_data["grid_draw_kw"] * tariff) + (log_data["diesel_draw_kw"] * 45.0)

            prob = pulp.LpProblem("Simulation_Step", pulp.LpMinimize)
            p_grid = pulp.LpVariable("G", lowBound=0)
            p_bat_dis = pulp.LpVariable("BD", lowBound=0)
            p_bat_chg = pulp.LpVariable("BC", lowBound=0)
            p_solar = pulp.LpVariable("S", lowBound=0)

            prob += (p_grid * tariff) + (p_bat_dis * 0.50)
            prob += p_solar + p_grid + p_bat_dis == load + p_bat_chg
            prob += p_solar <= solar

            if not grid_online:
                prob += p_grid == 0

            max_discharge_allowed = upgraded_bess_kwh * 0.4
            prob += p_bat_dis <= max_discharge_allowed

            if tariff <= 12.00:
                prob += p_bat_chg <= (upgraded_bess_kwh * 0.2)
            else:
                prob += p_bat_chg <= max(0, solar - load)

            prob.solve(pulp.PULP_CBC_CMD(msg=False))

            if pulp.LpStatus[prob.status] == "Optimal":
                total_cost_upgraded += (pulp.value(p_grid) * tariff)
            else:
                total_cost_upgraded += total_cost_current

        daily_savings = max(0.0, total_cost_current - total_cost_upgraded)
        annual_savings_kes = daily_savings * 365

        payback_years = round(battery_cost_kes / annual_savings_kes, 1) if annual_savings_kes > 0 else 0.0
        co2_saved_tons_annual = round((annual_savings_kes / tariff) * 0.38 / 1000, 2) if tariff > 0 else 0.0

        return {
            "annual_savings_kes": round(annual_savings_kes, 2),
            "payback_period_years": payback_years if payback_years > 0 else "N/A",
            "annual_co2_offset_tonnes": co2_saved_tons_annual,
            "simulated_days": 1
        }
