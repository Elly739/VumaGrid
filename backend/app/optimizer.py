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
